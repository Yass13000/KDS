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
  History,
  RotateCcw,
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

// --- LA SOLUTION : 7 LIGNES EXACTES PAR COLONNE ---
const LINES_PER_COLUMN = 7; 

const chunkArrayByLines = (arr: any[], linesPerCol: number) => {
  if (arr.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < arr.length; i += linesPerCol) {
    chunks.push(arr.slice(i, i + linesPerCol));
  }
  return chunks;
};

// --- NORMALISATION PARE-BALLES (SINGULIER / PLURIEL / ACCENTS) ---
const normalizeText = (str: string) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Supprime les accents
    .replace(/s\b/g, '') // Supprime les 's' en fin de mot (ex: menu toasts -> menu toast)
    .replace(/[^a-z0-9\s]/g, '') // Nettoie les émojis/caractères spéciaux
    .trim();
};

// --- PARSEUR DE COMMANDES ---
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
    const normName = normalizeText(name);
    return hiddenOptionNames.some(hidden => normalizeText(hidden) === normName);
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
        && o.name.toLowerCase() !== 'options';
  });

  formattedList.sort((a, b) => a.order - b.order);

  const finalOptions: { name: string, qty: number }[] = [];
  
  formattedList.forEach(opt => {
    let finalName = opt.name;
    let finalQty = 1;

    // Extraction et nettoyage d'un éventuel multiplicateur imbriqué (ex: "2X COMEBACK...")
    const matchPrefix = finalName.match(/^(\d+)\s*x\s*/i);
    if (matchPrefix) {
      finalQty = parseInt(matchPrefix[1], 10);
      finalName = finalName.replace(/^(\d+)\s*x\s*/i, '').trim();
    } else {
      const matchSuffix = finalName.match(/\s*x\s*(\d+)$/i);
      if (matchSuffix) {
        finalQty = parseInt(matchSuffix[1], 10);
        finalName = finalName.replace(/\s*x\s*(\d+)$/i, '').trim();
      }
    }

    // Vérification de masquage KDS sur le nom propre nettoyé
    if (isHidden(finalName)) {
      return; 
    }

    let displayName = finalName === "🍔 VERSION SOLO" ? finalName : `+ ${finalName}`;
    
    const existing = finalOptions.find(o => o.name === displayName);
    if (existing) {
      existing.qty += finalQty;
    } else {
      finalOptions.push({ name: displayName, qty: finalQty });
    }
  });

  return finalOptions.map(o => o.qty > 1 ? `${o.qty}x ${o.name}` : o.name);
};

const isActiveForKDS = (status: string) => {
  const s = status?.toLowerCase() || '';
  if (s === 'prête' || s === 'prete' || s === 'prêt' || s === 'pret') return false;
  if (s === 'fermé' || s === 'ferme' || s === 'terminée' || s === 'terminee') return false;
  if (s === 'annulée' || s === 'annulee') return false; 
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
  const [productNameDict, setProductNameDict] = useState<Record<string, string>>({});
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  
  const [dbHiddenCategories, setDbHiddenCategories] = useState<string[]>([]);

  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    JSON.parse(localStorage.getItem('kds_selected_categories') || '[]')
  );
  
  const [hiddenOptionNames, setHiddenOptionNames] = useState<string[]>([]);
  const [doneItems, setDoneItems] = useState<Record<string, boolean>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      fetchOrders(); 
    };
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [activeRestoId]);

  useEffect(() => {
    setDoneItems(prev => {
      const activeIds = orders.filter(o => isActiveForKDS(o.status)).map(o => o.id.toString());
      let hasChanges = false;
      const next = { ...prev };
      
      Object.keys(next).forEach(key => {
        const orderId = key.split('-')[0];
        if (!activeIds.includes(orderId)) {
          delete next[key]; 
          hasChanges = true;
        }
      });
      return hasChanges ? next : prev;
    });
  }, [orders]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchOrders();
    }, 3 * 60 * 1000); 
    return () => clearInterval(interval);
  }, [activeRestoId]);

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
      const { data: catData } = await supabase
        .from('categories')
        .select('name, show_on_kds')
        .eq('restaurant_id', activeRestoId);

      const hiddenCats: string[] = [];
      if (catData) {
        catData.forEach(c => {
          if (c.show_on_kds === false && c.name) {
            hiddenCats.push(c.name.toLowerCase().trim());
          }
        });
      }
      setDbHiddenCategories(hiddenCats);

      const { data } = await supabase.from('product').select('id, name, category').eq('restaurant_id', activeRestoId);
      if (data) {
        const dict: Record<string, string> = {};
        const nameDict: Record<string, string> = {};
        const cats = new Set<string>();
        data.forEach(p => {
          if (p.id) dict[p.id.toString()] = p.category;
          if (p.name) nameDict[p.name.toLowerCase().trim()] = p.category;
          if (p.category) cats.add(p.category);
        });
        setProductDict(dict);
        setProductNameDict(nameDict);
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
        .select('id, status, created_at, order_number, order_type_id, order_details') 
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
        fetchOrders();
        if (payload.eventType === 'INSERT') {
          if (payload.new.status?.toLowerCase() === 'nouvelle') playNotificationSound();
        } else if (payload.eventType === 'UPDATE') {
          const oldStatus = payload.old?.status?.toLowerCase();
          const newStatus = payload.new?.status?.toLowerCase();
          if (newStatus === 'nouvelle' && oldStatus !== 'nouvelle') playNotificationSound();
        }
      })
      .subscribe();

    const optionGroupsChannel = supabase
      .channel(`kds_optgroups_${activeRestoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'option_groups', filter: `restaurant_id=eq.${activeRestoId}` }, () => {
        fetchHiddenOptions();
      })
      .subscribe();

    const categoriesChannel = supabase
      .channel(`kds_categories_${activeRestoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `restaurant_id=eq.${activeRestoId}` }, () => {
        fetchCatalog();
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(optionGroupsChannel);
      supabase.removeChannel(categoriesChannel);
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

  // ========================================================================
  // FILTRAGE ROBUSTE AVEC HARMONISATION INTERNE ET COMPATIBILITÉ TEXTUELLE PLURIELS
  // ========================================================================
  const displayOrders = useMemo(() => {
    const active = orders.filter(o => isActiveForKDS(o.status));
    const normSelectedCats = selectedCategories.map(c => normalizeText(c));
    const normDbHiddenCategories = dbHiddenCategories.map(c => normalizeText(c));
    
    return active.map(order => {
      const allItems = parseOrderDetails(order.order_details);
      
      const filteredItems = allItems.map((item: any) => {
        if (!item) return null;
        
        // 1. Identification robuste et nettoyage de l'ID produit (gère "179-loaded-0" -> "179")
        const productId = (item.product?.id || item.id || item.product_id || '').toString().trim();
        const baseProductId = productId.includes('-') ? productId.split('-')[0] : productId;
        
        // Normalisation textuelle du nom du produit
        const itemInternalName = (item.product?.name || item.name || '').toLowerCase().trim();
        
        // 2. Détection triple sécurité : ID base -> ID complet -> Nom exact -> Contenu textuel
        let rawCategory = productDict[baseProductId] || productDict[productId] || productNameDict[itemInternalName] || item.product?.category || item.product?.category_id || item.category || item.category_id || '';
        
        // Fallback textuel intelligent normalisé (gère "menu toasts" vs "menu toast")
        if (!rawCategory && itemInternalName) {
          const normItemName = normalizeText(itemInternalName);
          const foundCat = availableCategories.find(cat => {
            const normCat = normalizeText(cat);
            return normCat && (normItemName.includes(normCat) || normCat.includes(normItemName));
          });
          if (foundCat) rawCategory = foundCat;
        }

        const mainCategory = rawCategory.toLowerCase().trim();
        const mainCategoryNorm = normalizeText(mainCategory);

        // Si aucune catégorie n'est détectée, on laisse passer le produit pour ne pas le perdre
        if (!mainCategoryNorm) return item;

        // Filtrage BDD (show_on_kds = false)
        if (normDbHiddenCategories.includes(mainCategoryNorm)) {
          return null;
        }

        // Filtrage d'écran tactile manuel
        if (normSelectedCats.length > 0 && !normSelectedCats.includes(mainCategoryNorm)) {
          return null;
        }

        const cleanItem = { ...item };

        if (cleanItem.boisson) {
          const boissonId = (cleanItem.boisson.id || '').toString().trim();
          const baseBoissonId = boissonId.includes('-') ? boissonId.split('-')[0] : boissonId;
          const boissonName = (cleanItem.boisson.name || '').toLowerCase().trim();
          
          let boissonCat = productDict[baseBoissonId] || productDict[boissonId] || productNameDict[boissonName] || cleanItem.boisson.category || cleanItem.boisson.category_id || '';
          if (!boissonCat && boissonName) {
            const normBoissonName = normalizeText(boissonName);
            const found = availableCategories.find(cat => {
              const normCat = normalizeText(cat);
              return normCat && (normBoissonName.includes(normCat) || normCat.includes(normBoissonName));
            });
            if (found) boissonCat = found;
          }
          const boissonCatNorm = normalizeText(boissonCat) || 'boisson';
          
          if (normDbHiddenCategories.includes(boissonCatNorm) || (normSelectedCats.length > 0 && !normSelectedCats.includes(boissonCatNorm))) {
            cleanItem.boisson = null; 
          }
        }

        if (cleanItem.accompagnement) {
          const accId = (cleanItem.accompagnement.id || '').toString().trim();
          const baseAccId = accId.includes('-') ? accId.split('-')[0] : accId;
          const accName = (cleanItem.accompagnement.name || '').toLowerCase().trim();
          
          let accCat = productDict[baseAccId] || productDict[accId] || productNameDict[accName] || cleanItem.accompagnement.category || cleanItem.accompagnement.category_id || '';
          if (!accCat && accName) {
            const normAccName = normalizeText(accName);
            const found = availableCategories.find(cat => {
              const normCat = normalizeText(cat);
              return normCat && (normAccName.includes(normCat) || normCat.includes(normAccName));
            });
            if (found) accCat = found;
          }
          const accCatNorm = normalizeText(accCat) || 'accompagnement';
          
          if (normDbHiddenCategories.includes(accCatNorm) || (normSelectedCats.length > 0 && !normSelectedCats.includes(accCatNorm))) {
            cleanItem.accompagnement = null; 
          }
        }

        return cleanItem;
      }).filter(Boolean);

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

      let totalLines = 0;
      groupedItems.forEach((gItem: any) => {
        totalLines += 1; 
        totalLines += gItem.options.length; 
      });
      
      let slots = Math.ceil(totalLines / LINES_PER_COLUMN);
      if (slots < 1) slots = 1;
      let displaySlots = slots > 5 ? 5 : slots;

      return { ...order, groupedItems, _slots: displaySlots, rawSlots: slots };
    }).filter(order => order.groupedItems.length > 0);
  }, [orders, selectedCategories, productDict, productNameDict, hiddenOptionNames, dbHiddenCategories, availableCategories]);

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

  const toggleItemDone = (orderId: string, itemSig: string) => {
    const key = `${orderId}-${itemSig}`;
    setDoneItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <div 
      className="h-[100dvh] w-full bg-secondary text-white font-helvetica flex flex-col overflow-hidden relative" 
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
          
          .custom-scrollbar::-webkit-scrollbar { width: 8px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.1); }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(100, 100, 100, 0.5); border-radius: 10px; }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(100, 100, 100, 0.8); }
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
            {selectedCategories.length > 0 || dbHiddenCategories.length > 0 ? "KDS (FILTRÉ)" : "KDS"}
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
        <div className="flex-1 w-full overflow-y-auto bg-gray-200 custom-scrollbar">
          <div className="grid grid-cols-5 w-full gap-0 auto-rows-max">
            
            {displayOrders.map((order) => {
              const status = order.status?.toLowerCase() || '';
              const isNewOrder = status === 'nouvelle';
              const displaySlots = order._slots || 1; 

              let colSpanClass = "col-span-1";
              if (displaySlots === 5) { colSpanClass = "col-span-5"; }
              else if (displaySlots === 4) { colSpanClass = "col-span-4"; }
              else if (displaySlots === 3) { colSpanClass = "col-span-3"; }
              else if (displaySlots === 2) { colSpanClass = "col-span-2"; }

              let headerBgClass = 'bg-gray-500'; 
              if (order.order_type_id === ORDER_TYPE_IDS.SUR_PLACE) {
                headerBgClass = 'bg-orange-500'; 
              } else if (order.order_type_id === ORDER_TYPE_IDS.EMPORTER) {
                headerBgClass = 'bg-[#b07d50]'; 
              } else if (order.order_type_id === ORDER_TYPE_IDS.LIVRAISON) {
                headerBgClass = 'bg-blue-400'; 
              }

              let borderClass = isNewOrder ? 'border-2 border-red-500 animate-alert' : 'border-r border-b border-gray-400';

              return (
                <div 
                  key={order.id} 
                  className={`bg-gray-100 flex flex-col overflow-hidden rounded-none h-[46dvh] ${borderClass} ${colSpanClass}`}
                >
                  <div className={`${headerBgClass} p-1.5 2xl:p-3 flex justify-between items-center border-b border-black/20 flex-shrink-0 z-10`}>
                    <div className="flex items-center gap-1 2xl:gap-2">
                      {isNewOrder && <BellRing className="w-3 h-3 2xl:w-6 2xl:h-6 text-white animate-bounce" />}
                      {getOrderTypeBadge(order.order_type_id)}
                    </div>
                    <OrderTimer createdAt={order.created_at} />
                    <div className="text-[13px] xl:text-lg 2xl:text-2xl font-black text-slate-900 bg-white px-1.5 2xl:px-3 rounded-sm">
                      {order.order_number || `#${order.id.toString().slice(-3)}`}
                    </div>
                  </div>

                  <div 
                    className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar bg-gray-50 p-1"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                  >
                    <div 
                      className="grid h-full" 
                      style={{ 
                        gridTemplateColumns: `repeat(${displaySlots}, minmax(0, 1fr))`,
                        gridAutoRows: '100%',
                        gap: '0.25rem' 
                      }}
                    >
                      {(() => {
                        const flatLines: any[] = [];
                        order.groupedItems.forEach((gItem: any) => {
                          const itemKey = `${order.id}-${gItem.sig}`;
                          
                          flatLines.push({
                            id: `${itemKey}-prod`,
                            isProduct: true,
                            qty: gItem.qty,
                            name: gItem.productName,
                            sig: gItem.sig,
                            itemKey,
                            hasOptions: gItem.options.length > 0
                          });
                          
                          gItem.options.forEach((opt: string, oIdx: number) => {
                             flatLines.push({
                                id: `${itemKey}-opt-${oIdx}`,
                                isProduct: false,
                                name: opt,
                                sig: gItem.sig,
                                itemKey,
                                isLast: oIdx === gItem.options.length - 1
                             });
                          });
                        });

                        return chunkArrayByLines(flatLines, LINES_PER_COLUMN).map((columnLines, colIdx) => (
                          <div 
                            key={`col-${colIdx}`} 
                            className="grid w-full h-full" 
                            style={{ gridTemplateRows: 'repeat(7, minmax(0, 1fr))' }}
                          >
                            {columnLines.map((line: any, lineIdx: number) => {
                              const isDone = !!doneItems[line.itemKey];
                              const isChunkFirst = lineIdx === 0;
                              const isChunkLast = lineIdx === columnLines.length - 1;

                              if (line.isProduct) {
                                return (
                                  <div 
                                    key={line.id}
                                    onClick={() => toggleItemDone(order.id, line.sig)}
                                    className={`min-h-0 w-full overflow-hidden flex items-center px-1.5 2xl:px-3 cursor-pointer transition-colors border-x border-gray-300 ${isChunkFirst ? 'border-t rounded-t-sm' : ''} ${(!line.hasOptions || isChunkLast) ? 'border-b rounded-b-sm shadow-sm' : 'border-b border-gray-200'} ${isDone ? 'bg-emerald-500' : 'bg-white'}`}
                                  >
                                    <span className={`px-1 py-px 2xl:px-2 2xl:py-0.5 rounded-sm text-[10px] xl:text-[12px] 2xl:text-[18px] font-black mr-1 2xl:mr-2 flex-shrink-0 ${isDone ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-white'}`}>
                                      {line.qty}x
                                    </span>
                                    <span className={`text-[10px] xl:text-[12px] 2xl:text-[18px] font-black uppercase leading-tight truncate ${isDone ? 'text-emerald-950' : 'text-slate-900'}`}>
                                      {line.name}
                                    </span>
                                  </div>
                                );
                              } else {
                                const cleanOptName = line.name.replace(/^[0-9]+x\s*/, '').replace(/^\+\s*/, '').trim().toLowerCase();
                                const isSans = cleanOptName.startsWith('sans');

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
                                    key={line.id} 
                                    onClick={() => toggleItemDone(order.id, line.sig)}
                                    className={`min-h-0 w-full overflow-hidden flex items-center px-1.5 2xl:px-3 cursor-pointer transition-colors border-x border-gray-300 ${bgClass} ${isChunkFirst ? 'border-t rounded-t-sm' : ''} ${isChunkLast ? 'border-b rounded-b-sm shadow-sm' : 'border-b border-white/10'}`}
                                  >
                                    <span className={`text-[10px] xl:text-[12px] 2xl:text-[18px] font-black uppercase leading-tight truncate ${textClass}`}>
                                      {line.name}
                                    </span>
                                  </div>
                                );
                              }
                            })}
                          </div>
                        ));
                      })()}
                    </div>
                  </div>

                  <div className="flex-shrink-0 border-t border-gray-300 z-10">
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
                  const isClosed = order.status?.toLowerCase() === 'fermé' || order.status?.toLowerCase() === 'ferme' || order.status?.toLowerCase() === 'annulée';
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
                    <button key={cat} onClick={() => toggleCategory(cat)} className={`px-3 py-1.5 2xl:px-6 2xl:py-3 text-[10px] 2xl:text-base font-black uppercase border rounded-none transition-colors ${selectedCategories.map(c => c.toLowerCase().trim()).includes(cat.toLowerCase().trim()) ? 'bg-amber-500 text-slate-900 border-amber-500' : 'bg-transparent text-white/70 border-white/20'}`}>
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