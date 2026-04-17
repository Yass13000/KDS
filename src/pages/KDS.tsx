// @ts-nocheck
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
  ChevronRight,
  Volume2,
  VolumeX,
  WifiOff,
  Filter
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

const getFormattedOptions = (item: any) => {
  let rawOptions: any[] = [];
  
  if (item.isSolo) {
    rawOptions.push({ name: "🍔 VERSION SOLO", _print_order: -999 });
  }

  const dynOpts = item.selectedSubOptions || item.selections || item.options || [];

  if (item.boisson) rawOptions.push({ name: item.boisson.name || item.boisson, _print_order: -2 });
  if (item.accompagnement) rawOptions.push({ name: item.accompagnement.name || item.accompagnement, _print_order: -1 });

  if (Array.isArray(dynOpts)) {
    dynOpts.forEach((group: any) => {
      if (group && group.options && Array.isArray(group.options)) {
        rawOptions.push(...group.options);
      } else {
        rawOptions.push(group);
      }
    });
  } else if (typeof dynOpts === 'object' && dynOpts !== null) {
    Object.keys(dynOpts).forEach(k => {
      const val = dynOpts[k];
      if (Array.isArray(val)) rawOptions.push(...val);
      else rawOptions.push(val);
    });
  }

  const formattedList = rawOptions.map((opt, i) => {
    let name = "";
    let order = opt._print_order !== undefined ? opt._print_order : i;

    if (typeof opt === 'string') {
      name = opt;
    } else {
      name = opt.name || opt.title || opt.variant_name || opt.value || "";
    }
    return { name: name.trim(), order };
  }).filter(o => o.name && o.name.toLowerCase() !== 'option' && o.name.toLowerCase() !== 'options');

  formattedList.sort((a, b) => a.order - b.order);

  const finalOptions: { name: string, qty: number }[] = [];
  
  formattedList.forEach(opt => {
    let finalName = opt.name === "🍔 VERSION SOLO" ? opt.name : `+ ${opt.name}`;
    
    const existing = finalOptions.find(o => o.name === finalName);
    if (existing) {
      existing.qty += 1;
    } else {
      finalOptions.push({ name: finalName, qty: 1 });
    }
  });

  return finalOptions.map(o => o.qty > 1 ? `${o.qty}x ${o.name}` : o.name);
};

const isActiveForKDS = (status: string) => {
  const s = status?.toLowerCase() || '';
  if (s === 'prête' || s === 'prete' || s === 'prêt' || s === 'pret') return false;
  if (s === 'fermé' || s === 'ferme' || s === 'terminée' || s === 'terminee') return false;
  return true; 
};

// --- COMPOSANTS ISOLÉS ---
const HeaderClock = () => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="text-base font-bold tracking-widest text-white/80 flex items-center gap-2 ml-3">
      <Clock size={28} className="text-emerald-400" />
      {time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
    </div>
  );
};

const OrderTimer = ({ createdAt }: { createdAt: string }) => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const created = new Date(createdAt).getTime();
  const diffSeconds = Math.max(0, Math.floor((now.getTime() - created) / 1000));
  const minutes = Math.floor(diffSeconds / 60);
  const seconds = diffSeconds % 60;

  const text = `${isNaN(minutes) ? '00' : minutes.toString().padStart(2, '0')}:${isNaN(seconds) ? '00' : seconds.toString().padStart(2, '0')}`;
  const isLate = minutes >= 15;
  const isWarning = minutes >= 10 && minutes < 15;

  let timeColorClass = 'bg-black/20 text-white border-transparent';
  if (isLate) timeColorClass = 'bg-red-600 text-white animate-pulse shadow-md border-red-400 scale-105';
  else if (isWarning) timeColorClass = 'bg-orange-500 text-white border-transparent';

  return (
    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border font-black text-xs md:text-sm tracking-wider transition-all ${timeColorClass}`}>
      <Timer size={14} />{text}
    </div>
  );
};

const KDS = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [missingIdError, setMissingIdError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  const [activeRestoId, setActiveRestoId] = useState(localStorage.getItem('pos_restaurant_id') || '');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [tempRestoId, setTempRestoId] = useState(activeRestoId);
  const [adminUnlockCount, setAdminUnlockCount] = useState(0);

  const [productDict, setProductDict] = useState<Record<string, string>>({});
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    JSON.parse(localStorage.getItem('kds_selected_categories') || '[]')
  );

  const [currentPage, setCurrentPage] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const audio = new Audio(ALERT_SOUND_URL);
    audio.preload = "auto";
    audioRef.current = audio;
  }, []);

  const unlockAudio = () => {
    if (audioRef.current && !audioEnabled) {
      audioRef.current.play().then(() => {
        audioRef.current?.pause();
        if (audioRef.current) audioRef.current.currentTime = 0;
        setAudioEnabled(true);
      }).catch(() => {});
    }
  };

  const playNotificationSound = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        setAudioEnabled(false);
        toast.error("Son bloqué par le navigateur. Cliquez sur l'écran.", { icon: <VolumeX className="text-red-500" /> });
      });
    }
  };

  const fetchCatalog = async () => {
    if (!activeRestoId) return;
    try {
      const { data } = await supabase.from('product').select('id, category').eq('restaurant_id', activeRestoId);
      if (data) {
        const dict: Record<string, string> = {};
        const cats = new Set<string>();
        data.forEach(p => {
          if (p.id) dict[p.id.toString()] = p.category;
          if (p.category) cats.add(p.category);
        });
        setProductDict(dict);
        setAvailableCategories(Array.from(cats).sort());
      }
    } catch (e) { console.error("Erreur chargement catalogue", e); }
  };

  const fetchOrders = async () => {
    if (!activeRestoId) {
      setMissingIdError(true);
      setIsLoading(false);
      return;
    }
    setMissingIdError(false);
    try {
      const past24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('restaurant_id', activeRestoId)
        .gte('created_at', past24Hours.toISOString())
        .order('created_at', { ascending: true });
        
      if (error) throw error;
      if (data) setOrders(data);
    } catch (e) {
      toast.error("Erreur de connexion avec la base de données");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchCatalog();
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
          const oldStatus = payload.old?.status?.toLowerCase();
          const newStatus = payload.new?.status?.toLowerCase();
          if (newStatus === 'nouvelle' && oldStatus !== 'nouvelle') playNotificationSound();
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
      toast.success("Commande acceptée !");
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
    fetchCatalog();
    setAdminUnlockCount(0); 
    setIsSettingsOpen(false);
    toast.success("Configuration mise à jour !");
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev => {
      const newCats = prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat];
      localStorage.setItem('kds_selected_categories', JSON.stringify(newCats));
      return newCats;
    });
  };

  const getOrderTypeBadge = (typeId: string) => {
    switch(typeId) {
      case ORDER_TYPE_IDS.SUR_PLACE: return <span className="text-[10px] md:text-[11px] font-black text-blue-600 bg-white rounded px-1.5 py-0.5 uppercase tracking-widest shadow-sm">SP</span>;
      case ORDER_TYPE_IDS.EMPORTER: return <span className="text-[10px] md:text-[11px] font-black text-orange-600 bg-white rounded px-1.5 py-0.5 uppercase tracking-widest shadow-sm">EMP</span>;
      case ORDER_TYPE_IDS.LIVRAISON: return <span className="text-[10px] md:text-[11px] font-black text-purple-600 bg-white rounded px-1.5 py-0.5 uppercase tracking-widest shadow-sm">LIV</span>;
      default: return <span className="text-[10px] md:text-[11px] font-black text-gray-600 bg-white rounded px-1.5 py-0.5 uppercase tracking-widest shadow-sm">?</span>;
    }
  };

  const displayOrders = useMemo(() => {
    const active = orders.filter(o => isActiveForKDS(o.status));
    
    return active.map(order => {
      const allItems = parseOrderDetails(order.order_details);
      
      if (selectedCategories.length === 0) {
        return { ...order, displayItems: allItems };
      }

      const filteredItems = allItems.filter((item: any) => {
        const productId = item.product?.id || item.id;
        const category = productDict[productId?.toString()] || item.product?.category || item.category;
        return category && selectedCategories.includes(category);
      });

      return { ...order, displayItems: filteredItems };
    }).filter(order => order.displayItems.length > 0);
  }, [orders, selectedCategories, productDict]);

  const historyOrders = orders
    .filter(o => !isActiveForKDS(o.status))
    .sort((a, b) => {
      const timeA = new Date(a.created_at).getTime() || 0;
      const timeB = new Date(b.created_at).getTime() || 0;
      return timeB - timeA;
    });
  
  // PAGINATION FIXE
  const CARDS_PER_PAGE = 10;
  const totalPages = Math.ceil(displayOrders.length / CARDS_PER_PAGE);

  useEffect(() => {
    if (currentPage >= totalPages && totalPages > 0) setCurrentPage(totalPages - 1);
    else if (totalPages === 0) setCurrentPage(0);
  }, [displayOrders.length, totalPages, currentPage]);

  const visibleOrders = displayOrders.slice(currentPage * CARDS_PER_PAGE, (currentPage + 1) * CARDS_PER_PAGE);

  const consolidatedSummary = useMemo(() => {
    const summary: Record<string, number> = {};
    let totalItems = 0;

    displayOrders.forEach(order => {
      order.displayItems.forEach((item: any) => {
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

    const sortedSummary = Object.entries(summary).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty);
    return { list: sortedSummary, totalItems };
  }, [displayOrders]);

  return (
    <div className="h-screen w-full bg-[#0f172a] text-white p-3 font-helvetica flex flex-col overflow-hidden relative" onClick={unlockAudio}>
      <style>
        {`
          @keyframes alert-blink {
            0% { border-color: #ef4444; box-shadow: 0 0 10px rgba(239, 68, 68, 0.4); }
            50% { border-color: #fca5a5; box-shadow: 0 0 35px rgba(239, 68, 68, 1); }
            100% { border-color: #ef4444; box-shadow: 0 0 10px rgba(239, 68, 68, 0.4); }
          }
          .animate-alert { animation: alert-blink 0.8s ease-in-out infinite; }
          .slide-in-right { animation: slideIn 0.3s forwards cubic-bezier(0.16, 1, 0.3, 1); }
          @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
          .custom-scrollbar::-webkit-scrollbar { width: 6px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.05); border-radius: 4px; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(200, 200, 200, 0.3); border-radius: 4px; }
        `}
      </style>

      {isOffline && (
        <div className="absolute top-0 left-0 right-0 bg-red-600 text-white text-center py-1.5 font-black uppercase tracking-widest text-xs flex justify-center items-center gap-2 z-50 animate-pulse shadow-lg">
          <WifiOff size={16} /> Attention : Connexion Internet perdue ! Le KDS n'est plus synchronisé.
        </div>
      )}

      {/* HEADER */}
      <div className={`flex justify-between items-center mb-3 px-2 z-10 relative flex-shrink-0 ${isOffline ? 'mt-8' : ''}`}>
        <div className="flex items-center gap-3">
          <span className="text-base font-black uppercase tracking-widest text-white/40">
            {selectedCategories.length > 0 ? "KDS (FILTRÉ)" : "KDS"}
          </span>
          {!missingIdError && (
            <span className="text-xs font-bold bg-white/10 px-3 py-1 rounded-full text-white/60">
              {displayOrders.length} en attente
            </span>
          )}
          
          <button onClick={() => setIsHistoryOpen(true)} className="bg-white/10 hover:bg-white/20 p-3 rounded-xl transition-colors relative ml-3 cursor-pointer" title="Historique">
            <History size={28} className="text-white pointer-events-none" />
            {historyOrders.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-emerald-500 text-slate-900 text-xs font-black px-2 py-0.5 rounded-full pointer-events-none">
                {historyOrders.length}
              </span>
            )}
          </button>

          <button onClick={unlockAudio} className={`ml-3 p-3 rounded-xl cursor-pointer ${audioEnabled ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20 animate-pulse'}`} title={audioEnabled ? "Son activé" : "Son bloqué (Cliquez ici)"}>
            {audioEnabled ? <Volume2 size={28} className="pointer-events-none" /> : <VolumeX size={28} className="pointer-events-none" />}
          </button>
        </div>

        <div className="flex items-center gap-3">
          {totalPages > 1 && (
            <div className="flex items-center gap-2 bg-white/5 rounded-xl p-1 mr-3 border border-white/10">
              <button onClick={(e) => { e.stopPropagation(); setCurrentPage(p => Math.max(0, p - 1)); }} disabled={currentPage === 0} className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors"><ChevronLeft size={28} className="text-white pointer-events-none" /></button>
              <span className="text-sm font-bold px-3 text-white/70 tracking-widest">{currentPage + 1} / {totalPages}</span>
              <button onClick={(e) => { e.stopPropagation(); setCurrentPage(p => Math.min(totalPages - 1, p + 1)); }} disabled={currentPage === totalPages - 1} className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors"><ChevronRight size={28} className="text-white pointer-events-none" /></button>
            </div>
          )}

          <button onClick={() => setIsSummaryOpen(true)} className="bg-amber-500/20 hover:bg-amber-500/40 border border-amber-500/50 p-3 px-5 rounded-xl transition-colors relative flex items-center gap-2">
            <ClipboardList size={28} className="text-amber-400 pointer-events-none" />
            <span className="text-xs font-black text-amber-400 uppercase tracking-widest pointer-events-none">Total à préparer</span>
            {consolidatedSummary.totalItems > 0 && <span className="absolute -top-2 -right-2 bg-amber-500 text-slate-900 text-xs font-black px-2 py-0.5 rounded-full shadow-lg pointer-events-none">{consolidatedSummary.totalItems}</span>}
          </button>

          <div className="w-px h-8 bg-white/20 mx-2"></div>
          <button onClick={() => fetchOrders()} className="bg-white/10 hover:bg-white/20 p-3 rounded-xl transition-colors"><RefreshCcw size={28} className={isLoading ? "animate-spin text-white/50 pointer-events-none" : "text-white pointer-events-none"} /></button>
          <button onClick={() => setIsSettingsOpen(true)} className="bg-white/10 hover:bg-white/20 p-3 rounded-xl transition-colors"><Settings size={28} className="text-white pointer-events-none" /></button>
          <HeaderClock />
        </div>
      </div>

      {missingIdError ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="bg-red-500/10 border-2 border-red-500/50 p-8 rounded-3xl max-w-md text-center">
            <AlertTriangle size={64} className="text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-black mb-2">ID Restaurant Manquant</h2>
            <button onClick={() => setIsSettingsOpen(true)} className="bg-white text-black font-black uppercase tracking-widest px-6 py-4 rounded-xl w-full flex justify-center items-center gap-2 hover:bg-gray-200 active:scale-95 transition-all">
              <Settings size={20} /> Configurer l'ID
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 relative w-full min-h-0">
          <div 
            className="absolute inset-0"
            style={{ columnCount: 5, columnGap: '12px', columnFill: 'auto' }}
          >
            {visibleOrders.map((order) => {
              const status = order.status?.toLowerCase() || '';
              const isNewOrder = status === 'nouvelle';
              let headerBgClass = isNewOrder ? 'bg-red-500' : 'bg-amber-600'; 
              let borderClass = isNewOrder ? 'border-[3px] border-red-500 animate-alert' : 'border-amber-600 shadow-md';

              return (
                <div 
                  key={order.id} 
                  className={`w-full break-inside-avoid mb-3 bg-white rounded-2xl border-2 flex flex-col overflow-hidden transition-all ${borderClass}`}
                >
                  
                  <div className={`${headerBgClass} p-2 flex justify-between items-center border-b border-black/10 flex-shrink-0`}>
                    <div className="flex items-center gap-1.5">
                      {isNewOrder && <BellRing size={16} className="text-white animate-bounce" />}
                      {getOrderTypeBadge(order.order_type_id)}
                    </div>
                    <OrderTimer createdAt={order.created_at} />
                    <div className="text-lg md:text-xl font-black text-slate-900 bg-white px-2 py-0.5 rounded-md shadow-sm">
                      {order.order_number || `#${order.id.toString().slice(-3)}`}
                    </div>
                  </div>

                  <div className="p-1.5 space-y-1.5 bg-gray-100 flex-1">
                    {order.displayItems.map((item: any, idx: number) => {
                      const productName = item.product?.name || item.name || 'Produit inconnu';
                      const qty = item.quantity || 1;
                      const options = getFormattedOptions(item);

                      return (
                        <div key={idx} className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-200">
                          {/* LIGNE PRODUIT : Fond clair, écriture foncée (Très grand) */}
                          <div className="px-3 py-2.5 flex gap-2 items-center">
                            <span className="text-white bg-slate-800 px-2 py-1 rounded text-sm font-black shadow-sm flex-shrink-0">{qty}x</span>
                            <span className="text-[17px] font-black text-slate-900 uppercase tracking-tight leading-tight">{productName}</span>
                          </div>
                          
                          {/* LIGNES OPTIONS : Fond très foncé, écriture blanche (Couleur inversée) */}
                          {options.length > 0 && (
                            <div className="bg-slate-800 px-3 py-2 flex flex-col gap-1 border-t border-slate-700">
                              {options.map((opt, oIdx) => (
                                <div key={oIdx} className="text-[13px] text-white font-bold leading-tight uppercase tracking-wider flex items-start gap-1">
                                   <span className="text-emerald-400 font-black mt-[1px]">↳</span> {opt}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex-shrink-0 bg-white border-t border-gray-200">
                    {isNewOrder ? (
                      <button onClick={() => acceptOrder(order.id)} className="w-full bg-red-500 hover:bg-red-600 text-white font-black text-sm uppercase tracking-widest py-3 transition-colors flex justify-center items-center gap-2 active:scale-95">
                        <BellRing size={18} className="animate-wiggle pointer-events-none" /> Accepter
                      </button>
                    ) : (
                      <button onClick={() => markOrderAsReady(order.id)} className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-black text-sm uppercase tracking-widest py-3 transition-colors flex justify-center items-center gap-2 active:scale-95">
                        <CheckCircle2 size={18} strokeWidth={3} className="pointer-events-none" /> Prêt
                      </button>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- PANNEAU RÉSUMÉ --- */}
      {isSummaryOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm transition-opacity" onClick={() => setIsSummaryOpen(false)} />
          <div className="fixed top-0 right-0 h-full w-[350px] bg-[#1e293b] border-l border-white/10 z-50 shadow-2xl flex flex-col slide-in-right">
            <div className="p-5 border-b border-white/10 flex justify-between items-center bg-amber-500/10">
              <div className="flex items-center gap-3">
                <div className="bg-amber-500 text-slate-900 p-2.5 rounded-lg"><ClipboardList size={24} /></div>
                <div><h2 className="text-lg font-black uppercase tracking-widest text-amber-400 leading-none">Global</h2><p className="text-xs text-amber-400/50 font-bold uppercase tracking-wider mt-1">À préparer en masse</p></div>
              </div>
              <button onClick={() => setIsSummaryOpen(false)} className="text-white/50 hover:text-white transition-colors bg-white/5 p-2 rounded-lg"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {consolidatedSummary.list.length === 0 ? (
                <div className="text-center py-10 text-white/40 font-bold uppercase tracking-widest text-sm">Aucun article à préparer</div>
              ) : (
                <ul className="space-y-3">
                  {consolidatedSummary.list.map((item, idx) => (
                    <li key={idx} className="flex items-center justify-between bg-white/5 border border-white/5 p-3 rounded-xl hover:bg-white/10 transition-colors">
                      <span className="text-sm font-black text-white/90 truncate pr-4">{item.name}</span>
                      <span className="flex-shrink-0 bg-amber-500 text-slate-900 font-black text-sm px-3 py-1 rounded-lg">{item.qty}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="p-4 border-t border-white/10 bg-black/20 text-center"><span className="text-xs text-white/50 font-bold uppercase tracking-widest">Total des articles en file : {consolidatedSummary.totalItems}</span></div>
          </div>
        </>
      )}

      {/* --- MODAL HISTORIQUE --- */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1e293b] rounded-3xl p-6 w-full max-w-3xl border border-white/10 shadow-2xl relative flex flex-col max-h-[85vh]">
            <button onClick={() => setIsHistoryOpen(false)} className="absolute top-5 right-5 text-white/50 hover:text-white transition-colors">
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

                  let timeString = "--:--";
                  try {
                     if (order.created_at) timeString = new Date(order.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                  } catch(e) {}

                  return (
                    <div key={order.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between hover:bg-white/10 transition-colors">
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="font-black text-lg text-white">{order.order_number || `#${order.id.toString().slice(-3)}`}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${isClosed ? 'bg-white/10 text-white/50' : 'bg-emerald-500/20 text-emerald-400'}`}>
                            {status}
                          </span>
                          <span className="text-xs text-white/40 font-bold">
                            {timeString}
                          </span>
                        </div>
                        <div className="text-sm text-white/70 truncate font-medium">
                          {items.filter(Boolean).map((i: any) => `${i.quantity || 1}x ${i.product?.name || i.name || 'Article'}`).join(' • ')}
                        </div>
                      </div>
                      
                      <button onClick={() => revertOrder(order.id)} className="flex-shrink-0 flex items-center gap-2 bg-white/10 hover:bg-amber-500 hover:text-slate-900 text-white font-black px-4 py-3 rounded-xl transition-all text-xs uppercase tracking-widest active:scale-95">
                        <RotateCcw size={18} className="pointer-events-none" /> Remettre en cours
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
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#1e293b] rounded-3xl w-full max-w-4xl max-h-[90vh] border border-white/10 shadow-2xl relative flex flex-col overflow-hidden">
            
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-[#0f172a]">
              <div className="flex items-center gap-4">
                <div className="bg-emerald-500/20 text-emerald-400 p-3 rounded-2xl"><Settings size={32} /></div>
                <div>
                  <h2 
                    className="text-2xl font-black uppercase tracking-widest text-white select-none cursor-default"
                    onClick={() => {
                      if (adminUnlockCount < 5) {
                        setAdminUnlockCount(prev => prev + 1);
                        if (adminUnlockCount === 4) toast.success("Mode Administrateur débloqué !");
                      }
                    }}
                  >
                    Paramètres KDS
                  </h2>
                  <p className="text-sm text-white/50 font-bold uppercase tracking-wider">Configuration de l'écran</p>
                </div>
              </div>
              <button onClick={() => { setIsSettingsOpen(false); setAdminUnlockCount(0); }} className="text-white/50 hover:text-white transition-colors bg-white/5 p-3 rounded-xl"><X size={24} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
              
              {(!activeRestoId || adminUnlockCount >= 5) && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Store className="text-emerald-500" size={20}/>
                    <h3 className="text-lg font-black uppercase tracking-widest text-white">Liaison Restaurant</h3>
                  </div>
                  <div className="bg-white/5 p-5 rounded-2xl border border-emerald-500/30">
                    <label className="block text-xs font-bold text-emerald-500/80 uppercase tracking-wider mb-3">ID du Restaurant (Sécurité Admin)</label>
                    <div className="flex gap-3">
                      <input type="text" value={tempRestoId} onChange={(e) => setTempRestoId(e.target.value)} placeholder="Ex: d8f3198b-a7f0-..." className="flex-1 bg-[#0f172a] border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-emerald-500 transition-colors" />
                      <button onClick={handleSaveSettings} className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-black uppercase tracking-widest px-8 py-3 rounded-xl transition-all active:scale-95 text-sm">Enregistrer</button>
                    </div>
                  </div>
                </section>
              )}

              <section>
                <div className="flex justify-between items-end mb-4">
                  <div className="flex items-center gap-2">
                    <Filter className="text-amber-500" size={20}/>
                    <h3 className="text-lg font-black uppercase tracking-widest text-white">Poste de préparation</h3>
                  </div>
                  {selectedCategories.length > 0 && (
                    <button onClick={() => { setSelectedCategories([]); localStorage.removeItem('kds_selected_categories'); }} className="text-xs text-red-400 font-bold uppercase tracking-widest hover:text-red-300">Réinitialiser (Tout afficher)</button>
                  )}
                </div>
                <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                  <p className="text-sm text-white/60 mb-5 leading-relaxed">
                    Si vous sélectionnez des catégories, cet écran n'affichera <strong className="text-white">que les produits correspondants</strong>. Laissez tout décoché pour utiliser cet écran comme <strong className="text-white">Écran Principal</strong>.
                  </p>
                  
                  {availableCategories.length === 0 ? (
                    <div className="text-center py-6 text-white/30 font-bold text-sm uppercase tracking-widest">
                      {activeRestoId ? "Chargement du catalogue..." : "Veuillez d'abord configurer l'ID du restaurant"}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {availableCategories.map(cat => {
                        const isSelected = selectedCategories.includes(cat);
                        return (
                          <button
                            key={cat}
                            onClick={() => toggleCategory(cat)}
                            className={`px-5 py-3 rounded-xl text-sm font-black uppercase tracking-wider transition-all active:scale-95 border ${isSelected ? 'bg-amber-500 text-slate-900 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-[#0f172a] text-white/70 border-white/10 hover:border-white/30 hover:bg-white/5'}`}
                          >
                            {cat}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KDS;