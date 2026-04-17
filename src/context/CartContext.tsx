import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { 
  Clock, 
  CheckCircle2, 
  Timer,
  BellRing,
  AlertTriangle,
  RefreshCcw,
  Settings,
  X,
  Store,
  History,
  RotateCcw,
  ClipboardList,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const ORDER_TYPE_IDS = {
  SUR_PLACE: '633425b1-f86c-4c17-8cba-b258906ad317',
  EMPORTER: '2cac3f10-73e2-40a5-a7e0-053bd861b4d9',
  LIVRAISON: 'c48b80a4-0dcd-4f75-9e67-a99d30bf4f9d'
};

const ALERT_SOUND_URL = "https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg";

const parseOrderDetails = (details: any): any[] => {
  if (Array.isArray(details)) return details;
  if (typeof details === 'string') {
    try {
      const parsed = JSON.parse(details);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.items)) return parsed.items;
      return [parsed];
    } catch (e) { return []; }
  }
  return [];
};

// --- LOGIQUE EXACTE EXTRAITE DU FICHIER CART.TSX ---
const getFormattedOptions = (item: any) => {
  const opts: string[] = [];

  // 1. Gestion de la version Solo
  if (item.isSolo) {
    opts.push("🍔 VERSION SOLO");
  }

  // 2. Lecture stricte selon la structure de Cart.tsx (selectedSubOptions -> group -> options -> opt.name)
  if (item.selectedSubOptions && Array.isArray(item.selectedSubOptions)) {
    item.selectedSubOptions.forEach((group: any) => {
      if (group.options && Array.isArray(group.options)) {
        group.options.forEach((opt: any) => {
          if (opt && opt.name) {
            opts.push(`+ ${opt.name}`);
          }
        });
      }
    });
  }

  // 3. Regroupement des doublons pour la cuisine (ex: 2x + Ketchup)
  const grouped: Record<string, number> = {};
  opts.forEach(opt => {
    grouped[opt] = (grouped[opt] || 0) + 1;
  });

  return Object.entries(grouped).map(([name, count]) => {
    return count > 1 ? `${count}x ${name}` : name;
  });
};

const isActiveForKDS = (status: string) => {
  const s = status?.toLowerCase() || '';
  if (s === 'prête' || s === 'prete' || s === 'prêt' || s === 'pret') return false;
  if (s === 'fermé' || s === 'ferme' || s === 'terminée' || s === 'terminee') return false;
  return true; 
};

const KDS = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [missingIdError, setMissingIdError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const [activeRestoId, setActiveRestoId] = useState(localStorage.getItem('pos_restaurant_id') || '');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [tempRestoId, setTempRestoId] = useState(activeRestoId);

  const [currentPage, setCurrentPage] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio(ALERT_SOUND_URL);
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const playNotificationSound = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => console.log("Audio bloqué"));
    }
  };

  const fetchOrders = async () => {
    if (!activeRestoId) {
      setMissingIdError(true);
      setIsLoading(false);
      return;
    }
    
    setMissingIdError(false);

    try {
      const today = new Date();
      const startOfLocalDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('restaurant_id', activeRestoId)
        .gte('created_at', startOfLocalDay.toISOString())
        .order('created_at', { ascending: true });
      
      if (error) throw error;

      if (data) {
        setOrders(data);
      }
    } catch (e) {
      console.error("Erreur Fetch:", e);
      toast.error("Erreur de connexion avec la base de données");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();

    if (!activeRestoId) return;

    const channel = supabase
      .channel(`kds_${activeRestoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${activeRestoId}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setOrders(prev => {
            if (prev.find(o => o.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
          if (payload.new.status?.toLowerCase() === 'nouvelle') playNotificationSound();
        } else if (payload.eventType === 'UPDATE') {
          setOrders(prev => {
            const exists = prev.find(o => o.id === payload.new.id);
            if (exists) return prev.map(o => o.id === payload.new.id ? payload.new : o);
            return [...prev, payload.new];
          });
        } else if (payload.eventType === 'DELETE') {
          setOrders(prev => prev.filter(o => o.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeRestoId]);

  const acceptOrder = async (orderId: string | number) => {
    try {
      await supabase.from('orders').update({ status: 'En cours' }).eq('id', orderId);
      toast.success("Commande acceptée en cuisine !");
    } catch (e) { toast.error("Erreur"); }
  };

  const markOrderAsReady = async (orderId: string | number) => {
    try {
      await supabase.from('orders').update({ status: 'Prêt' }).eq('id', orderId);
      toast.success("Commande prête !");
    } catch (e) { toast.error("Erreur"); }
  };

  const revertOrder = async (orderId: string | number) => {
    try {
      await supabase.from('orders').update({ status: 'En cours' }).eq('id', orderId);
      toast.success("Commande replacée en cuisine !");
      setIsHistoryOpen(false); 
    } catch (e) { toast.error("Erreur lors de la restauration"); }
  };

  const handleSaveSettings = () => {
    if (tempRestoId.trim().length < 5) {
      toast.error("Veuillez entrer un ID valide");
      return;
    }
    localStorage.setItem('pos_restaurant_id', tempRestoId.trim());
    setActiveRestoId(tempRestoId.trim());
    setIsSettingsOpen(false);
    toast.success("ID du restaurant mis à jour !");
  };

  const formatElapsedTime = (createdAtStr: string) => {
    const created = new Date(createdAtStr).getTime();
    const now = currentTime.getTime();
    const diffSeconds = Math.max(0, Math.floor((now - created) / 1000));
    const minutes = Math.floor(diffSeconds / 60);
    const seconds = diffSeconds % 60;
    return {
      text: `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
      minutes
    };
  };

  const getOrderTypeBadge = (typeId: string) => {
    switch(typeId) {
      case ORDER_TYPE_IDS.SUR_PLACE: 
        return <span className="text-[11px] font-black text-blue-600 bg-white rounded px-1.5 py-0.5 uppercase tracking-widest shadow-sm">SP</span>;
      case ORDER_TYPE_IDS.EMPORTER: 
        return <span className="text-[11px] font-black text-orange-600 bg-white rounded px-1.5 py-0.5 uppercase tracking-widest shadow-sm">EMP</span>;
      case ORDER_TYPE_IDS.LIVRAISON: 
        return <span className="text-[11px] font-black text-purple-600 bg-white rounded px-1.5 py-0.5 uppercase tracking-widest shadow-sm">LIV</span>;
      default: 
        return <span className="text-[11px] font-black text-gray-600 bg-white rounded px-1.5 py-0.5 uppercase tracking-widest shadow-sm">?</span>;
    }
  };

  const activeOrders = orders.filter(o => isActiveForKDS(o.status));
  const historyOrders = orders
    .filter(o => !isActiveForKDS(o.status))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  
  const itemsPerPage = 10;
  const totalPages = Math.ceil(activeOrders.length / itemsPerPage);

  useEffect(() => {
    if (currentPage >= totalPages && totalPages > 0) {
      setCurrentPage(totalPages - 1);
    } else if (totalPages === 0) {
      setCurrentPage(0);
    }
  }, [activeOrders.length, totalPages, currentPage]);

  const visibleOrders = activeOrders.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage);

  const consolidatedSummary = useMemo(() => {
    const summary: Record<string, number> = {};
    let totalItems = 0;

    activeOrders.forEach(order => {
      const items = parseOrderDetails(order.order_details);
      items.forEach((item: any) => {
        const name = item.product?.name || item.name || 'Produit Inconnu';
        const qty = item.quantity || 1;
        if (!summary[name]) summary[name] = 0;
        summary[name] += qty;
        totalItems += qty;

        const options = getFormattedOptions(item);
        options.forEach(opt => {
          let optName = opt.replace(/^[0-9]+x\s*/, '').replace(/^\+\s*/, '').trim();
          if (optName === "🍔 VERSION SOLO") return; 
          
          let optQty = qty;
          const match = opt.match(/^([0-9]+)x/);
          if (match) optQty = qty * parseInt(match[1], 10);

          if (!summary[optName]) summary[optName] = 0;
          summary[optName] += optQty;
          totalItems += optQty;
        });
      });
    });

    const sortedSummary = Object.entries(summary)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty);

    return { list: sortedSummary, totalItems };
  }, [activeOrders]);

  return (
    <div className="h-screen w-full bg-[#0f172a] text-white p-3 font-helvetica flex flex-col overflow-hidden relative">
      
      <style>
        {`
          @keyframes alert-blink {
            0% { border-color: #ef4444; box-shadow: 0 0 10px rgba(239, 68, 68, 0.4); }
            50% { border-color: #fca5a5; box-shadow: 0 0 35px rgba(239, 68, 68, 1); }
            100% { border-color: #ef4444; box-shadow: 0 0 10px rgba(239, 68, 68, 0.4); }
          }
          .animate-alert {
            animation: alert-blink 0.8s ease-in-out infinite;
          }
          
          .slide-in-right {
            animation: slideIn 0.3s forwards cubic-bezier(0.16, 1, 0.3, 1);
          }
          @keyframes slideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}
      </style>

      {/* HEADER ULTRA-COMPACT */}
      <div className="flex justify-between items-center mb-2 px-1 z-10 relative">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black uppercase tracking-widest text-white/40">
            KDS
          </span>
          {!missingIdError && (
            <span className="text-[10px] font-bold bg-white/10 px-2 py-0.5 rounded-full text-white/50">
              {activeOrders.length} en attente
            </span>
          )}
          
          <button onClick={() => setIsHistoryOpen(true)} className="bg-white/10 hover:bg-white/20 p-1.5 rounded-lg transition-colors relative ml-2" title="Historique">
            <History size={14} className="text-white" />
            {historyOrders.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-slate-900 text-[8px] font-black px-1.5 rounded-full">
                {historyOrders.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          
          {totalPages > 1 && (
            <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5 mr-2 border border-white/10">
              <button 
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))} 
                disabled={currentPage === 0}
                className="p-1 rounded-md hover:bg-white/10 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={16} className="text-white" />
              </button>
              <span className="text-xs font-bold px-2 text-white/70 tracking-widest">
                {currentPage + 1} / {totalPages}
              </span>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))} 
                disabled={currentPage === totalPages - 1}
                className="p-1 rounded-md hover:bg-white/10 disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={16} className="text-white" />
              </button>
            </div>
          )}

          <button 
            onClick={() => setIsSummaryOpen(true)} 
            className="bg-amber-500/20 hover:bg-amber-500/40 border border-amber-500/50 p-1.5 px-3 rounded-lg transition-colors relative flex items-center gap-2" 
            title="Résumé de Production"
          >
            <ClipboardList size={14} className="text-amber-400" />
            <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
              Total à préparer
            </span>
            {consolidatedSummary.totalItems > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-slate-900 text-[9px] font-black px-1.5 rounded-full shadow-lg">
                {consolidatedSummary.totalItems}
              </span>
            )}
          </button>

          <div className="w-px h-4 bg-white/20 mx-0.5"></div>

          <button onClick={() => fetchOrders()} className="bg-white/10 hover:bg-white/20 p-1.5 rounded-lg transition-colors" title="Rafraîchir">
            <RefreshCcw size={14} className={isLoading ? "animate-spin text-white/50" : "text-white"} />
          </button>
          
          <button onClick={() => setIsSettingsOpen(true)} className="bg-white/10 hover:bg-white/20 p-1.5 rounded-lg transition-colors" title="Paramètres">
            <Settings size={14} className="text-white" />
          </button>

          <div className="text-sm font-bold tracking-widest text-white/80 flex items-center gap-1.5 ml-1.5">
            <Clock size={14} className="text-emerald-400" />
            {currentTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {missingIdError ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="bg-red-500/10 border-2 border-red-500/50 p-8 rounded-3xl max-w-md text-center">
            <AlertTriangle size={64} className="text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-black mb-2">ID Restaurant Manquant</h2>
            <p className="text-gray-400 mb-6">L'écran cuisine ne sait pas à quel restaurant se connecter.</p>
            <button onClick={() => setIsSettingsOpen(true)} className="bg-white text-black font-black uppercase tracking-widest px-6 py-4 rounded-xl w-full flex justify-center items-center gap-2 hover:bg-gray-200 active:scale-95 transition-all">
              <Settings size={20} /> Configurer l'ID
            </button>
          </div>
        </div>
      ) : (
        /* GRILLE 5x2 */
        <div className="flex-1 grid grid-cols-5 grid-rows-2 gap-3 relative z-0">
          {visibleOrders.map((order) => {
            const timeData = formatElapsedTime(order.created_at);
            const status = order.status?.toLowerCase() || '';
            const isNewOrder = status === 'nouvelle';
            
            const isLate = timeData.minutes >= 15;
            const isWarning = timeData.minutes >= 10 && timeData.minutes < 15;
            
            let headerBgClass = 'bg-amber-600'; 
            let borderClass = 'border-amber-600 shadow-sm';

            if (isNewOrder) {
              headerBgClass = 'bg-red-500'; 
              borderClass = 'border-4 border-red-500 animate-alert';
            }

            let timeColorClass = 'bg-black/20 text-white border-transparent';
            if (isLate) {
              timeColorClass = 'bg-red-600 text-white animate-pulse shadow-md border-red-400 scale-105';
            } else if (isWarning) {
              timeColorClass = 'bg-orange-500 text-white border-transparent';
            }

            const items = parseOrderDetails(order.order_details);

            return (
              <div key={order.id} className={`bg-white rounded-2xl border-2 flex flex-col overflow-hidden transition-all ${borderClass}`}>
                
                <div className={`${headerBgClass} p-2 flex justify-between items-center border-b border-black/10`}>
                  <div className="flex items-center gap-1.5">
                    {isNewOrder && <BellRing size={14} className="text-white animate-bounce" />}
                    {getOrderTypeBadge(order.order_type_id)}
                  </div>

                  <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border font-black text-[11px] tracking-wider transition-all ${timeColorClass}`}>
                    <Timer size={12} />
                    {timeData.text}
                  </div>

                  <div className="text-sm font-black text-slate-900 bg-white px-2 py-0.5 rounded-md shadow-sm">
                    {order.order_number || `#${order.id.toString().slice(-3)}`}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-1.5 bg-white">
                  {items.map((item: any, idx: number) => {
                    const productName = item.product?.name || item.name || 'Produit inconnu';
                    const qty = item.quantity || 1;
                    const options = getFormattedOptions(item);

                    return (
                      <div key={idx} className="bg-gray-50 rounded-lg p-1.5 border border-gray-100">
                        <div className="flex gap-1.5 items-start font-bold">
                          <span className="text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded text-[10px] leading-none mt-0.5">{qty}x</span>
                          <span className="text-xs font-black text-slate-800 leading-tight">{productName}</span>
                        </div>
                        {options.length > 0 && (
                          <div className="mt-1 pl-7 text-[9px] text-slate-500 space-y-0.5 font-bold leading-tight">
                            {options.map((optName: string, oIdx: number) => (
                              <div key={oIdx} className="uppercase tracking-wider">{optName}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {isNewOrder ? (
                  <button onClick={() => acceptOrder(order.id)} className="bg-red-500 hover:bg-red-600 text-white font-black text-xs uppercase tracking-widest py-3 transition-colors flex justify-center items-center gap-1.5 active:scale-95">
                    <BellRing size={14} className="animate-wiggle" /> Accepter
                  </button>
                ) : (
                  <button onClick={() => markOrderAsReady(order.id)} className="bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-black text-xs uppercase tracking-widest py-3 transition-colors flex justify-center items-center gap-1.5 active:scale-95">
                    <CheckCircle2 size={14} strokeWidth={3} /> Prêt
                  </button>
                )}

              </div>
            );
          })}

          {Array.from({ length: Math.max(0, itemsPerPage - visibleOrders.length) }).map((_, idx) => (
            <div key={`empty-${idx}`} className="bg-[#1e293b]/30 rounded-2xl border border-white/5 border-dashed" />
          ))}
        </div>
      )}

      {/* --- PANNEAU LATÉRAL : RÉSUMÉ CONSOLIDÉ --- */}
      {isSummaryOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm transition-opacity" 
            onClick={() => setIsSummaryOpen(false)}
          />
          <div className="fixed top-0 right-0 h-full w-[350px] bg-[#1e293b] border-l border-white/10 z-50 shadow-2xl flex flex-col slide-in-right">
            
            <div className="p-5 border-b border-white/10 flex justify-between items-center bg-amber-500/10">
              <div className="flex items-center gap-3">
                <div className="bg-amber-500 text-slate-900 p-2 rounded-lg">
                  <ClipboardList size={24} />
                </div>
                <div>
                  <h2 className="text-lg font-black uppercase tracking-widest text-amber-400 leading-none">Global</h2>
                  <p className="text-xs text-amber-400/50 font-bold uppercase tracking-wider mt-1">À préparer en masse</p>
                </div>
              </div>
              <button onClick={() => setIsSummaryOpen(false)} className="text-white/50 hover:text-white transition-colors bg-white/5 p-2 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {consolidatedSummary.list.length === 0 ? (
                <div className="text-center py-10 text-white/40 font-bold uppercase tracking-widest text-sm">
                  Aucun article à préparer
                </div>
              ) : (
                <ul className="space-y-3">
                  {consolidatedSummary.list.map((item, idx) => (
                    <li key={idx} className="flex items-center justify-between bg-white/5 border border-white/5 p-3 rounded-xl hover:bg-white/10 transition-colors">
                      <span className="text-sm font-black text-white/90 truncate pr-4">{item.name}</span>
                      <span className="flex-shrink-0 bg-amber-500 text-slate-900 font-black text-sm px-3 py-1 rounded-lg">
                        {item.qty}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            
            <div className="p-4 border-t border-white/10 bg-black/20 text-center">
              <span className="text-xs text-white/50 font-bold uppercase tracking-widest">Total des articles en file d'attente : {consolidatedSummary.totalItems}</span>
            </div>
          </div>
        </>
      )}

      {/* --- MODAL HISTORIQUE (RESTAURATION) --- */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1e293b] rounded-3xl p-6 w-full max-w-3xl border border-white/10 shadow-2xl relative flex flex-col max-h-[85vh]">
            <button onClick={() => setIsHistoryOpen(false)} className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors">
              <X size={24} />
            </button>
            
            <div className="flex items-center gap-3 mb-6 flex-shrink-0">
              <div className="bg-blue-500/20 text-blue-400 p-3 rounded-2xl">
                <History size={32} />
              </div>
              <div>
                <h2 className="text-xl font-black uppercase tracking-widest text-white">Historique du jour</h2>
                <p className="text-xs text-white/50 font-bold uppercase tracking-wider">{historyOrders.length} commandes terminées</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
              {historyOrders.length === 0 ? (
                <div className="text-center py-10 text-white/40 font-bold uppercase tracking-widest">Aucune commande terminée</div>
              ) : (
                historyOrders.map(order => {
                  const status = order.status || '';
                  const isClosed = status.toLowerCase() === 'fermé' || status.toLowerCase() === 'ferme';
                  const items = parseOrderDetails(order.order_details);

                  return (
                    <div key={order.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between hover:bg-white/10 transition-colors">
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="font-black text-lg text-white">{order.order_number || `#${order.id.toString().slice(-3)}`}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${isClosed ? 'bg-white/10 text-white/50' : 'bg-emerald-500/20 text-emerald-400'}`}>
                            {status}
                          </span>
                          <span className="text-xs text-white/40 font-bold">
                            {new Date(order.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="text-sm text-white/70 truncate font-medium">
                          {items.map((i: any) => `${i.quantity || 1}x ${i.product?.name || i.name}`).join(' • ')}
                        </div>
                      </div>
                      
                      <button onClick={() => revertOrder(order.id)} className="flex-shrink-0 flex items-center gap-2 bg-white/10 hover:bg-amber-500 hover:text-slate-900 text-white font-black px-4 py-3 rounded-xl transition-all text-xs uppercase tracking-widest active:scale-95">
                        <RotateCcw size={16} /> Remettre en cours
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- PARAMÈTRES (MODAL) --- */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1e293b] rounded-3xl p-6 w-full max-w-md border border-white/10 shadow-2xl relative">
            <button onClick={() => setIsSettingsOpen(false)} className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors">
              <X size={24} />
            </button>
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-emerald-500/20 text-emerald-400 p-3 rounded-2xl">
                <Store size={32} />
              </div>
              <div>
                <h2 className="text-xl font-black uppercase tracking-widest text-white">Paramètres KDS</h2>
                <p className="text-xs text-white/50 font-bold uppercase tracking-wider">Liaison au restaurant</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-2">ID du Restaurant (Supabase)</label>
                <input type="text" value={tempRestoId} onChange={(e) => setTempRestoId(e.target.value)} placeholder="Ex: d8f3198b-a7f0-..." className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-emerald-500 transition-colors" />
              </div>
              <button onClick={handleSaveSettings} className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-black uppercase tracking-widest py-4 rounded-xl transition-all active:scale-95">
                Sauvegarder l'ID
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default KDS;