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

const getFormattedOptions = (item: any, hiddenOptionNames: string[] = []) => {
  let rawOptions: any[] = [];
  
  const isHidden = (name: string) => {
    if (!name || typeof name !== 'string') return false;
    const normalized = name.toLowerCase().trim();
    return hiddenOptionNames.some(hidden => {
      const h = hidden.toLowerCase().trim();
      return normalized === h || normalized === h + 's' || normalized + 's' === h;
    });
  };

  if (item.isSolo) {
    rawOptions.push({ name: "🍔 VERSION SOLO", _print_order: -999 });
  }

  const dynOpts = item.selectedSubOptions || item.selections || item.options || [];

  if (item.boisson) {
    const boissonName = item.boisson.name || item.boisson;
    if (!isHidden(boissonName) && !isHidden('boisson')) {
      rawOptions.push({ name: boissonName, _print_order: -2 });
    }
  }
  
  if (item.accompagnement) {
    const accName = item.accompagnement.name || item.accompagnement;
    if (!isHidden(accName) && !isHidden('accompagnement')) {
      rawOptions.push({ name: accName, _print_order: -1 });
    }
  }

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
      if (Array.isArray(val)) {
        rawOptions.push(...val);
      } else {
        rawOptions.push(val);
      }
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
  }).filter(o => {
    return o.name 
        && o.name.toLowerCase() !== 'option' 
        && o.name.toLowerCase() !== 'options' 
        && !isHidden(o.name);
  });

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

const HeaderClock = () => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="text-xs xl:text-sm 2xl:text-xl font-bold tracking-widest text-white/80 flex items-center gap-1.5 ml-2">
      <Clock className="w-4 h-4 xl:w-5 xl:h-5 2xl:w-8 2xl:h-8 text-primary" />
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
  if (isLate) timeColorClass = 'bg-red-600 text-white animate-pulse border-red-400';
  else if (isWarning) timeColorClass = 'bg-orange-500 text-white border-transparent';

  return (
    <div className={`flex items-center gap-1 px-1 py-0.5 2xl:px-3 2xl:py-1.5 border font-black text-[11px] xl:text-sm 2xl:text-xl tracking-wider transition-all ${timeColorClass}`}>
      <Timer className="w-3 h-3 xl:w-4 xl:h-4 2xl:w-6 2xl:h-6" />{text}
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
  const [tempRestoId, setTempRestoId] = useState(activeRestoId);
  const [adminUnlockCount, setAdminUnlockCount] = useState(0);

  const [themeColors, setThemeColors] = useState({ primary: '#FBBF24', secondary: '#1e293b' });

  const [productDict, setProductDict] = useState<Record<string, string>>({});
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    JSON.parse(localStorage.getItem('kds_selected_categories') || '[]')
  );
  
  const [hiddenOptionNames, setHiddenOptionNames] = useState<string[]>([]);

  // ÉTAT POUR LE SUIVI DES LIGNES TERMINÉES
  const [doneItems, setDoneItems] = useState<Record<string, boolean>>({});

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
        toast.error("Son bloqué par le navigateur. Cliquez sur l'écran.", { icon: <VolumeX className="w-5 h-5 text-red-500" /> });
      });
    }
  };

  const fetchTheme = async () => {
    if (!activeRestoId) return;
    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select('theme_primary, theme_secondary')
        .eq('id', activeRestoId)
        .single();
        
      if (data && !error) {
        setThemeColors({
          primary: data.theme_primary || '#FBBF24',
          secondary: data.theme_secondary || '#1e293b'
        });
      }
    } catch (e) {
      console.error("Erreur de chargement du thème", e);
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

  const fetchHiddenOptions = async () => {
    if (!activeRestoId) return;
    try {
      const { data: groups } = await supabase
        .from('option_groups')
        .select('id, name')
        .eq('restaurant_id', activeRestoId)
        .eq('show_on_kds', false);

      if (!groups || groups.length === 0) {
        setHiddenOptionNames([]);
        return;
      }

      const groupIds = groups.map(g => g.id);
      const namesToHide = new Set<string>();
      
      groups.forEach(g => {
        if (g.name) namesToHide.add(g.name.toLowerCase().trim());
      });

      const { data: links } = await supabase
        .from('option_group_links')
        .select('option_id')
        .in('group_id', groupIds);

      if (links && links.length > 0) {
        const optionIds = links.map(l => l.option_id);
        
        const { data: options } = await supabase
          .from('options')
          .select('name')
          .in('id', optionIds);

        if (options) {
          options.forEach(o => {
            if (o.name) namesToHide.add(o.name.toLowerCase().trim());
          });
        }
      }

      setHiddenOptionNames(Array.from(namesToHide));
    } catch (e) { 
      console.error("Erreur lors de la récupération des options masquées", e); 
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
    fetchHiddenOptions();
    fetchTheme();
    if (!activeRestoId) return;

    const ordersChannel = supabase
      .channel(`kds_orders_${activeRestoId}`)
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
            if (exists) return prev.map(o => o.id === payload.new.id ? { ...o, ...payload.new } : o);
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

    const optionGroupsChannel = supabase
      .channel(`kds_optgroups_${activeRestoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'option_groups', filter: `restaurant_id=eq.${activeRestoId}` }, () => {
        fetchHiddenOptions();
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(optionGroupsChannel);
    };
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
    fetchHiddenOptions();
    fetchTheme();
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
      case ORDER_TYPE_IDS.SUR_PLACE: return <span className="text-[9px] xl:text-xs 2xl:text-sm font-black text-blue-600 bg-white px-1 2xl:px-2 py-0.5 uppercase tracking-widest">SP</span>;
      case ORDER_TYPE_IDS.EMPORTER: return <span className="text-[9px] xl:text-xs 2xl:text-sm font-black text-orange-600 bg-white px-1 2xl:px-2 py-0.5 uppercase tracking-widest">EMP</span>;
      case ORDER_TYPE_IDS.LIVRAISON: return <span className="text-[9px] xl:text-xs 2xl:text-sm font-black text-purple-600 bg-white px-1 2xl:px-2 py-0.5 uppercase tracking-widest">LIV</span>;
      default: return <span className="text-[9px] xl:text-xs 2xl:text-sm font-black text-gray-600 bg-white px-1 2xl:px-2 py-0.5 uppercase tracking-widest">?</span>;
    }
  };

  const displayOrders = useMemo(() => {
    const active = orders.filter(o => isActiveForKDS(o.status));
    
    return active.map(order => {
      const allItems = parseOrderDetails(order.order_details);
      
      let filteredItems = allItems;
      if (selectedCategories.length > 0) {
        filteredItems = allItems.filter((item: any) => {
          const productId = item.product?.id || item.id;
          const category = productDict[productId?.toString()] || item.product?.category || item.category;
          return category && selectedCategories.includes(category);
        });
      }

      const groupedItems: any[] = [];
      filteredItems.forEach((item: any) => {
        const productName = item.product?.name || item.name || 'Produit inconnu';
        const qty = item.quantity || 1;
        
        const options = getFormattedOptions(item, hiddenOptionNames);
        const sig = `${productName}|${options.join('|')}`;
        
        const existing = groupedItems.find(g => g.sig === sig);
        if (existing) {
          existing.qty += qty;
        } else {
          groupedItems.push({ productName, qty, options, sig });
        }
      });

      return { ...order, groupedItems };
    }).filter(order => order.groupedItems.length > 0);
  }, [orders, selectedCategories, productDict, hiddenOptionNames]);

  const historyOrders = orders
    .filter(o => !isActiveForKDS(o.status))
    .filter(o => {
      if (!o.created_at) return false;
      const orderTime = new Date(o.created_at).getTime();
      return (Date.now() - orderTime) <= 24 * 60 * 60 * 1000;
    })
    .sort((a, b) => {
      const timeA = new Date(a.created_at).getTime() || 0;
      const timeB = new Date(b.created_at).getTime() || 0;
      return timeB - timeA;
    });
  
  const pages: any[][] = [];
  let currentPageOrders: any[] = [];
  let currentSlots = 0;

  displayOrders.forEach(order => {
    let totalLines = 0;
    
    order.groupedItems.forEach((gItem: any) => {
      totalLines += 1; 
      totalLines += gItem.options.length; 
    });

    const slots = totalLines > 14 ? 3 : (totalLines > 7 ? 2 : 1);
    const orderWithSlots = { ...order, _slots: slots };
    
    if (currentSlots + slots > 10 && currentPageOrders.length > 0) {
      pages.push(currentPageOrders);
      currentPageOrders = [orderWithSlots];
      currentSlots = slots;
    } else {
      currentPageOrders.push(orderWithSlots);
      currentSlots += slots;
    }
  });
  if (currentPageOrders.length > 0) pages.push(currentPageOrders);

  const totalPages = pages.length;
  const safeCurrentPage = Math.min(currentPage, Math.max(0, totalPages - 1));
  const visibleOrders = pages[safeCurrentPage] || [];

  // FONCTION POUR BASCULER L'ÉTAT "FAIT" D'UN PRODUIT
  const toggleItemDone = (orderId: string, itemIdx: number) => {
    const key = `${orderId}-${itemIdx}`;
    setDoneItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <div 
      className="h-screen w-full bg-secondary text-white font-helvetica flex flex-col overflow-hidden relative" 
      onClick={unlockAudio}
      style={{
        '--theme-primary': themeColors.primary,
        '--theme-secondary': themeColors.secondary,
      } as React.CSSProperties}
    >
      <style>
        {`
          .bg-secondary { background-color: var(--theme-secondary) !important; }
          .text-primary { color: var(--theme-primary) !important; }

          @keyframes alert-blink {
            0% { border-color: #ef4444; box-shadow: inset 0 0 5px rgba(239, 68, 68, 0.4); }
            50% { border-color: #fca5a5; box-shadow: inset 0 0 15px rgba(239, 68, 68, 1); }
            100% { border-color: #ef4444; box-shadow: inset 0 0 5px rgba(239, 68, 68, 0.4); }
          }
          .animate-alert { animation: alert-blink 0.8s ease-in-out infinite; }
          .slide-in-right { animation: slideIn 0.3s forwards cubic-bezier(0.16, 1, 0.3, 1); }
          @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
          
          .custom-scrollbar::-webkit-scrollbar { width: 6px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.05); }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(200, 200, 200, 0.3); border-radius: 10px; }
        `}
      </style>

      {isOffline && (
        <div className="absolute top-0 left-0 right-0 bg-red-600 text-white text-center py-1 2xl:py-2 font-black uppercase tracking-widest text-[10px] 2xl:text-base flex justify-center items-center gap-1.5 z-50 animate-pulse">
          <WifiOff className="w-3 h-3 2xl:w-5 2xl:h-5" /> Hors ligne ! KDS non synchronisé.
        </div>
      )}

      {/* HEADER ADAPTATIF */}
      <div className={`flex justify-between items-center px-2 py-1 2xl:px-4 2xl:py-3 bg-secondary border-b border-black/50 z-10 flex-shrink-0 ${isOffline ? 'mt-6 2xl:mt-10' : ''}`}>
        <div className="flex items-center gap-2 2xl:gap-4">
          <span className="text-[11px] xl:text-sm 2xl:text-xl font-black uppercase tracking-widest text-white/50">
            {selectedCategories.length > 0 ? "KDS (FILTRÉ)" : "KDS"}
          </span>
          {!missingIdError && (
            <span className="text-[10px] xl:text-xs 2xl:text-lg font-bold bg-white/10 px-2 py-0.5 2xl:px-3 2xl:py-1 rounded-sm text-white/70">
              {displayOrders.length} attente
            </span>
          )}
          
          <button onClick={() => setIsHistoryOpen(true)} className="bg-white/5 hover:bg-white/10 p-1.5 2xl:p-3 rounded transition-colors relative ml-1 2xl:ml-3" title="Historique">
            <History className="w-4 h-4 xl:w-5 xl:h-5 2xl:w-8 2xl:h-8 text-primary" />
            {historyOrders.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-emerald-500 text-slate-900 text-[9px] 2xl:text-sm font-black px-1 2xl:px-2 rounded-sm">
                {historyOrders.length}
              </span>
            )}
          </button>

          <button onClick={unlockAudio} className={`p-1.5 2xl:p-3 rounded ml-1 2xl:ml-3 ${audioEnabled ? 'bg-emerald-500/10' : 'bg-red-500/10 animate-pulse'}`} title="Son">
            {audioEnabled ? <Volume2 className="w-4 h-4 xl:w-5 xl:h-5 2xl:w-8 2xl:h-8 text-primary" /> : <VolumeX className="w-4 h-4 xl:w-5 xl:h-5 2xl:w-8 2xl:h-8 text-primary" />}
          </button>
        </div>

        <div className="flex items-center gap-2 2xl:gap-4">
          {totalPages > 1 && (
            <div className="flex items-center gap-1 2xl:gap-2 bg-white/5 rounded p-0.5 2xl:p-1.5 border border-white/10">
              <button onClick={(e) => { e.stopPropagation(); setCurrentPage(p => Math.max(0, p - 1)); }} disabled={safeCurrentPage === 0} className="p-1 2xl:p-2 hover:bg-white/10 disabled:opacity-30 rounded-sm"><ChevronLeft className="w-4 h-4 xl:w-5 xl:h-5 2xl:w-8 2xl:h-8 text-primary" /></button>
              <span className="text-[11px] xl:text-sm 2xl:text-xl font-bold px-1 2xl:px-3 text-white/70">{safeCurrentPage + 1}/{totalPages}</span>
              <button onClick={(e) => { e.stopPropagation(); setCurrentPage(p => Math.min(totalPages - 1, p + 1)); }} disabled={safeCurrentPage === totalPages - 1} className="p-1 2xl:p-2 hover:bg-white/10 disabled:opacity-30 rounded-sm"><ChevronRight className="w-4 h-4 xl:w-5 xl:h-5 2xl:w-8 2xl:h-8 text-primary" /></button>
            </div>
          )}

          <div className="w-px h-5 2xl:h-8 bg-white/20 mx-1 2xl:mx-3"></div>
          <button onClick={() => { fetchOrders(); fetchHiddenOptions(); }} className="bg-white/5 hover:bg-white/10 p-1.5 2xl:p-3 rounded">
            <RefreshCcw className={`w-4 h-4 xl:w-5 xl:h-5 2xl:w-8 2xl:h-8 ${isLoading ? "animate-spin text-primary/70" : "text-primary"}`} />
          </button>
          <button onClick={() => setIsSettingsOpen(true)} className="bg-white/5 hover:bg-white/10 p-1.5 2xl:p-3 rounded">
            <Settings className="w-4 h-4 xl:w-5 xl:h-5 2xl:w-8 2xl:h-8 text-primary" />
          </button>
          <HeaderClock />
        </div>
      </div>

      {missingIdError ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="bg-red-500/10 border border-red-500/50 p-6 2xl:p-12 rounded-none text-center">
            <AlertTriangle className="w-12 h-12 2xl:w-24 2xl:h-24 text-red-500 mx-auto mb-4 2xl:mb-8" />
            <h2 className="text-xl 2xl:text-4xl font-black mb-2 2xl:mb-4">ID Restaurant Manquant</h2>
            <button onClick={() => setIsSettingsOpen(true)} className="bg-white text-black font-black uppercase text-sm 2xl:text-2xl px-4 py-2 2xl:px-8 2xl:py-4 rounded-none flex justify-center items-center gap-2 2xl:gap-4">
              <Settings className="w-4 h-4 2xl:w-8 2xl:h-8" /> Configurer
            </button>
          </div>
        </div>
      ) : (
        /* GRILLE 5x2 STRICTE SANS ESPACE */
        <div className="flex-1 w-full overflow-hidden bg-gray-200">
          <div className="grid grid-cols-5 grid-rows-2 w-full h-full gap-0">
            
            {visibleOrders.map((order) => {
              const status = order.status?.toLowerCase() || '';
              const isNewOrder = status === 'nouvelle';
              const slots = order._slots || 1;

              let colSpanClass = "col-span-1";
              let colCountClass = "columns-1";

              if (slots === 3) {
                colSpanClass = "col-span-3";
                colCountClass = "columns-3";
              } else if (slots === 2) {
                colSpanClass = "col-span-2";
                colCountClass = "columns-2";
              }

              let headerBgClass = isNewOrder ? 'bg-red-600' : 'bg-amber-600'; 
              let borderClass = isNewOrder ? 'border-2 border-red-500 animate-alert' : 'border-r border-b border-gray-400';

              return (
                <div 
                  key={order.id} 
                  className={`bg-gray-100 flex flex-col overflow-hidden rounded-none ${borderClass} ${colSpanClass}`}
                >
                  
                  {/* EN TÊTE DU TICKET */}
                  <div className={`${headerBgClass} p-1.5 2xl:p-3 flex justify-between items-center border-b border-black/20 flex-shrink-0`}>
                    <div className="flex items-center gap-1 2xl:gap-2">
                      {isNewOrder && <BellRing className="w-3 h-3 2xl:w-6 2xl:h-6 text-white animate-bounce" />}
                      {getOrderTypeBadge(order.order_type_id)}
                    </div>
                    <OrderTimer createdAt={order.created_at} />
                    <div className="text-[13px] xl:text-lg 2xl:text-2xl font-black text-slate-900 bg-white px-1.5 2xl:px-3 rounded-sm">
                      {order.order_number || `#${order.id.toString().slice(-3)}`}
                    </div>
                  </div>

                  {/* CORPS DU TICKET (REMPLISSAGE INTELLIGENT DE COLONNES SANS TROUS) */}
                  <div className={`p-1 2xl:p-2 flex-1 overflow-hidden ${colCountClass}`} style={{ columnFill: 'auto', columnGap: '0.25rem' }}>
                    {order.groupedItems.map((gItem: any, idx: number) => {
                      const { productName, qty, options } = gItem;
                      const hasOptions = options.length > 0;
                      
                      const itemKey = `${order.id}-${idx}`;
                      const isDone = !!doneItems[itemKey]; // Vérifie si ce bloc a été cliqué

                      return (
                        <React.Fragment key={idx}>
                          {/* LIGNE PRODUIT CLIQUABLE */}
                          <div 
                            onClick={() => toggleItemDone(order.id, idx)}
                            className={`px-1.5 py-1 2xl:px-3 2xl:py-2 break-inside-avoid cursor-pointer transition-colors ${hasOptions ? '' : 'mb-1 2xl:mb-2 shadow-sm'} ${isDone ? 'bg-emerald-500' : 'bg-white'}`}
                            style={{
                              borderLeft: '1px solid #d1d5db',
                              borderRight: '1px solid #d1d5db',
                              borderTop: '1px solid #d1d5db',
                              borderBottom: hasOptions ? 'none' : '1px solid #d1d5db'
                            }}
                          >
                            <span className={`inline-block px-1 py-px 2xl:px-2 2xl:py-0.5 rounded-sm text-[11px] xl:text-sm 2xl:text-xl font-black mr-1 2xl:mr-2 align-middle ${isDone ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-white'}`}>
                              {qty}x
                            </span>
                            <span className={`inline-block text-[13px] xl:text-base 2xl:text-2xl font-black uppercase leading-none tracking-tight align-middle ${isDone ? 'text-emerald-950' : 'text-slate-900'}`}>
                              {productName}
                            </span>
                          </div>
                          
                          {/* LIGNES OPTIONS CLIQUABLES */}
                          {options.map((opt: string, oIdx: number) => {
                            const isFirst = oIdx === 0;
                            const isLast = oIdx === options.length - 1;
                            
                            // Détection intelligente du mot "sans" (Même avec "2x + Sans Frites")
                            const cleanOptName = opt.replace(/^[0-9]+x\s*/, '').replace(/^\+\s*/, '').trim().toLowerCase();
                            const isSans = cleanOptName.startsWith('sans');

                            // Gestion intelligente des couleurs de fond
                            let bgClass = 'bg-slate-800';
                            let textClass = 'text-white';
                            
                            if (isDone) {
                              bgClass = 'bg-emerald-400';
                              textClass = 'text-emerald-950';
                            } else if (isSans) {
                              bgClass = 'bg-red-500';
                              textClass = 'text-white';
                            }

                            return (
                              <div 
                                key={oIdx} 
                                onClick={() => toggleItemDone(order.id, idx)}
                                className={`px-1.5 py-0.5 2xl:px-3 2xl:py-1 break-inside-avoid cursor-pointer transition-colors ${bgClass} ${isLast ? 'mb-1 2xl:mb-2 shadow-sm' : ''}`}
                                style={{
                                  borderLeft: '1px solid #d1d5db',
                                  borderRight: '1px solid #d1d5db',
                                  borderTop: isFirst && !isDone ? '1px solid #334155' : (isFirst && isDone ? '1px solid #34d399' : 'none'),
                                  borderBottom: isLast ? '1px solid #d1d5db' : 'none'
                                }}
                              >
                                <span className={`block text-[13px] xl:text-base 2xl:text-2xl font-black leading-none uppercase tracking-tight ${textClass}`}>
                                  {opt}
                                </span>
                              </div>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </div>

                  {/* BOUTON D'ACTION RÉDUIT */}
                  <div className="flex-shrink-0 border-t border-gray-300">
                    {isNewOrder ? (
                      <button onClick={() => acceptOrder(order.id)} className="w-full bg-red-600 hover:bg-red-700 text-white font-black text-[11px] xl:text-sm 2xl:text-xl uppercase tracking-widest py-1.5 2xl:py-3 transition-colors flex justify-center items-center gap-1.5 2xl:gap-3 rounded-none">
                        <BellRing className="w-3.5 h-3.5 2xl:w-6 2xl:h-6" /> Accepter
                      </button>
                    ) : (
                      <button onClick={() => markOrderAsReady(order.id)} className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-black text-[11px] xl:text-sm 2xl:text-xl uppercase tracking-widest py-1.5 2xl:py-3 transition-colors flex justify-center items-center gap-1.5 2xl:gap-3 rounded-none">
                        <CheckCircle2 className="w-3.5 h-3.5 2xl:w-6 2xl:h-6" strokeWidth={3} /> Prêt
                      </button>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- MODAL HISTORIQUE --- */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 2xl:p-12">
          <div className="bg-secondary p-4 2xl:p-8 w-full max-w-2xl 2xl:max-w-5xl border border-white/10 flex flex-col max-h-[85vh] rounded-none">
            <div className="flex justify-between items-center mb-4 2xl:mb-8">
              <h2 className="text-lg 2xl:text-3xl font-black uppercase text-white flex items-center gap-2 2xl:gap-4"><History className="w-5 h-5 2xl:w-8 2xl:h-8"/> Historique</h2>
              <button onClick={() => setIsHistoryOpen(false)} className="text-white/50 hover:text-white"><X className="w-5 h-5 2xl:w-8 2xl:h-8" /></button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 2xl:space-y-4">
              {historyOrders.length === 0 ? (
                <div className="text-center py-6 2xl:py-12 text-white/40 text-xs 2xl:text-xl">Aucune commande récente</div>
              ) : (
                historyOrders.map(order => {
                  const isClosed = order.status?.toLowerCase() === 'fermé' || order.status?.toLowerCase() === 'ferme';
                  const items = parseOrderDetails(order.order_details);

                  return (
                    <div key={order.id} className="bg-white/5 border border-white/10 p-3 2xl:p-6 flex justify-between items-center rounded-none">
                      <div>
                        <div className="flex items-center gap-2 2xl:gap-4 mb-1 2xl:mb-3">
                          <span className="font-black text-sm 2xl:text-2xl text-white">{order.order_number || `#${order.id.toString().slice(-3)}`}</span>
                          <span className={`px-1.5 py-0.5 2xl:px-3 2xl:py-1 text-[9px] 2xl:text-sm font-black uppercase ${isClosed ? 'bg-white/10 text-white/50' : 'bg-emerald-500/20 text-emerald-400'}`}>{order.status}</span>
                        </div>
                        <div className="text-[11px] 2xl:text-lg text-white/60">
                          {items.filter(Boolean).map((i: any) => `${i.quantity || 1}x ${i.product?.name || i.name || 'Article'}`).join(' • ')}
                        </div>
                      </div>
                      
                      <button onClick={() => revertOrder(order.id)} className="bg-white/10 hover:bg-amber-500 hover:text-slate-900 text-white font-black px-3 py-1.5 2xl:px-6 2xl:py-3 text-[10px] 2xl:text-base uppercase rounded-none transition-colors flex items-center gap-1 2xl:gap-2">
                        <RotateCcw className="w-3 h-3 2xl:w-5 2xl:h-5" /> Restaurer
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- PARAMÈTRES --- */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 2xl:p-12">
          <div className="bg-secondary w-full max-w-2xl 2xl:max-w-5xl border border-white/10 flex flex-col rounded-none">
            <div className="p-4 2xl:p-8 border-b border-white/10 flex justify-between items-center bg-secondary">
              <h2 className="text-base 2xl:text-3xl font-black uppercase text-white flex items-center gap-2 2xl:gap-4" onClick={() => setAdminUnlockCount(p => p + 1)}><Settings className="w-5 h-5 2xl:w-8 2xl:h-8"/> Paramètres</h2>
              <button onClick={() => { setIsSettingsOpen(false); setAdminUnlockCount(0); }} className="text-white/50 hover:text-white p-1 2xl:p-2"><X className="w-5 h-5 2xl:w-8 2xl:h-8" /></button>
            </div>

            <div className="p-4 2xl:p-8 space-y-6 2xl:space-y-12">
              {(!activeRestoId || adminUnlockCount >= 5) && (
                <div>
                  <label className="block text-[11px] 2xl:text-lg font-bold text-emerald-500 uppercase mb-2 2xl:mb-4">ID du Restaurant</label>
                  <div className="flex gap-2 2xl:gap-4">
                    <input type="text" value={tempRestoId} onChange={(e) => setTempRestoId(e.target.value)} className="flex-1 bg-black/50 border border-white/20 px-3 py-2 2xl:px-6 2xl:py-4 text-white text-xs 2xl:text-xl rounded-none focus:outline-none focus:border-emerald-500" />
                    <button onClick={handleSaveSettings} className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-black uppercase px-4 py-2 2xl:px-8 2xl:py-4 text-[11px] 2xl:text-xl rounded-none">Sauver</button>
                  </div>
                </div>
              )}

              <div>
                <div className="flex justify-between items-end mb-2 2xl:mb-4">
                  <h3 className="text-xs 2xl:text-xl font-black uppercase text-white flex items-center gap-1.5 2xl:gap-3"><Filter className="w-3.5 h-3.5 2xl:w-6 2xl:h-6 text-amber-500"/> Filtres par catégorie</h3>
                  {selectedCategories.length > 0 && <button onClick={() => { setSelectedCategories([]); localStorage.removeItem('kds_selected_categories'); }} className="text-[10px] 2xl:text-base text-red-400 font-bold uppercase">Tout afficher</button>}
                </div>
                
                <div className="flex flex-wrap gap-2 2xl:gap-4">
                  {availableCategories.map(cat => (
                    <button key={cat} onClick={() => toggleCategory(cat)} className={`px-3 py-1.5 2xl:px-6 2xl:py-3 text-[10px] 2xl:text-base font-black uppercase border rounded-none transition-colors ${selectedCategories.includes(cat) ? 'bg-amber-500 text-slate-900 border-amber-500' : 'bg-transparent text-white/70 border-white/20'}`}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KDS;