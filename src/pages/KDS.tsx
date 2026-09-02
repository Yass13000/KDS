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
  Filter,
  LayoutGrid,
  Type,
  CalendarClock,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { getFormattedOrderOptions, fetchOptionGroupMapping } from '@/lib/orderFormatter';
import { ScheduledOrdersModal } from '@/components/ScheduledOrdersModal';

const ORDER_TYPE_IDS = {
  SUR_PLACE: '633425b1-f86c-4c17-8cba-b258906ad317',
  EMPORTER: '2cac3f10-73e2-40a5-a7e0-053bd861b4d9',
  LIVRAISON: 'c48b80a4-0dcd-4f75-9e67-a99d30bf4f9d'
};

const LINES_PER_SINGLE_ROW = 7; 
const LINES_PER_DOUBLE_ROW = 15; 
const SCHEDULED_THRESHOLD_MINUTES = 30;

export const isRealScheduledOrder = (order: any, now: Date) => {
  if (!order.scheduled_time) return false;
  const schedTime = new Date(order.scheduled_time).getTime();
  const createdTime = new Date(order.created_at).getTime();
  if (isNaN(schedTime) || isNaN(createdTime)) return false;

  const diffFromCreation = (schedTime - createdTime) / 60000;
  const diffFromNow = (schedTime - now.getTime()) / 60000;

  return diffFromCreation > 30 && diffFromNow > SCHEDULED_THRESHOLD_MINUTES;
};

const PRODUCT_FONT_CONFIGS: Record<string, { label: string; textClass: string; qtyClass: string }> = {
  small: { label: 'Petite', textClass: 'text-[9.5px] xl:text-[11.5px] 2xl:text-[16px]', qtyClass: 'text-[9px] xl:text-[11px] 2xl:text-[15px]' },
  normal: { label: 'Normale', textClass: 'text-[11px] xl:text-[13px] 2xl:text-[18px]', qtyClass: 'text-[10px] xl:text-[12px] 2xl:text-[17px]' },
  large: { label: 'Grande', textClass: 'text-[12.5px] xl:text-[14.5px] 2xl:text-[20px]', qtyClass: 'text-[11px] xl:text-[13px] 2xl:text-[18px]' },
  xlarge: { label: 'Très grande', textClass: 'text-[14px] xl:text-[16px] 2xl:text-[22px]', qtyClass: 'text-[12px] xl:text-[14px] 2xl:text-[19px]' }
};

const OPTION_FONT_CONFIGS: Record<string, { label: string; single: string; double: string; triple: string }> = {
  small: {
    label: 'Petite',
    single: 'text-[8.5px] xl:text-[10px] 2xl:text-[14px]',
    double: 'text-[7.5px] xl:text-[8.5px] 2xl:text-[12px] tracking-tight',
    triple: 'text-[6.5px] xl:text-[7.5px] 2xl:text-[10px] tracking-tighter leading-none'
  },
  normal: {
    label: 'Normale',
    single: 'text-[9.5px] xl:text-[11.5px] 2xl:text-[16px]',
    double: 'text-[8.5px] xl:text-[9.5px] 2xl:text-[13px] tracking-tight',
    triple: 'text-[7px] xl:text-[8px] 2xl:text-[11px] tracking-tighter leading-none'
  },
  large: {
    label: 'Grande',
    single: 'text-[11px] xl:text-[13px] 2xl:text-[18px]',
    double: 'text-[9.5px] xl:text-[11px] 2xl:text-[15px] tracking-tight',
    triple: 'text-[8px] xl:text-[9px] 2xl:text-[12.5px] tracking-tighter leading-none'
  }
};

const chunkArrayByLines = (arr: any[], linesPerCol: number) => {
  if (arr.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < arr.length; i += linesPerCol) {
    chunks.push(arr.slice(i, i + linesPerCol));
  }
  return chunks;
};

const normalizeText = (str: string) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") 
    .replace(/[^a-z0-9\s]/g, '') 
    .trim();
};

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

const extractOptionLinesForKDS = (
  item: any, 
  hiddenOptionNames: string[] = [], 
  groupMapping: Record<string, string> = {},
  groupInline: boolean = true
) => {
  const isHidden = (name: string) => {
    if (!name || typeof name !== 'string') return false;
    const normName = normalizeText(name);
    if (!normName) return false;
    return hiddenOptionNames.some(hidden => {
      const normHidden = normalizeText(hidden);
      return normHidden && (normName === normHidden || normName.replace(/^sans\s+/, '') === normHidden);
    });
  };

  const resultRows: { items: { name: string; qty: number; isSans: boolean }[]; isSans: boolean; groupIdx: number }[] = [];
  let groupCounter = 0;

  const optionGroups = getFormattedOrderOptions(item, groupMapping);

  const sansItems: { name: string; qty: number; isSans: boolean }[] = [];
  const normalGroups: { groupName: string; items: { name: string; qty: number; isSans: boolean }[] }[] = [];

  optionGroups.forEach(grp => {
    if ((grp.originalGroupName && isHidden(grp.originalGroupName)) || (grp.groupName && isHidden(grp.groupName))) {
      return;
    }

    const validItems = (grp.items || []).filter(opt => opt && opt.name && !isHidden(opt.name));
    if (validItems.length === 0) return;

    validItems.forEach(opt => {
      if (opt.isSans || grp.originalGroupName === 'INGRÉDIENTS') {
        sansItems.push({ name: opt.name, qty: opt.qty || 1, isSans: true });
      }
    });

    const nonSansItems = validItems.filter(opt => !opt.isSans && grp.originalGroupName !== 'INGRÉDIENTS');
    if (nonSansItems.length > 0) {
      normalGroups.push({
        groupName: grp.originalGroupName || grp.groupName || '',
        items: nonSansItems.map(opt => ({ name: opt.name, qty: opt.qty || 1, isSans: false }))
      });
    }
  });

  if (sansItems.length > 0) {
    if (groupInline) {
      for (let i = 0; i < sansItems.length; i += 2) {
        resultRows.push({ items: sansItems.slice(i, i + 2), isSans: true, groupIdx: -1 });
      }
    } else {
      sansItems.forEach(opt => {
        resultRows.push({ items: [opt], isSans: true, groupIdx: -1 });
      });
    }
  }

  normalGroups.forEach(grp => {
    const currentIdx = groupCounter++;
    if (groupInline) {
      for (let i = 0; i < grp.items.length; i += 3) {
        resultRows.push({ items: grp.items.slice(i, i + 3), isSans: false, groupIdx: currentIdx });
      }
    } else {
      grp.items.forEach(opt => {
        resultRows.push({ items: [opt], isSans: false, groupIdx: currentIdx });
      });
    }
  });

  return resultRows;
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

const OrderTimer = ({ 
  createdAt, 
  now, 
  scheduledTime, 
  targetPrepMinutes = 15 
}: { 
  createdAt: string; 
  now: Date; 
  scheduledTime?: string; 
  targetPrepMinutes?: number;
}) => {
  const created = new Date(createdAt).getTime();
  const schedTime = scheduledTime ? new Date(scheduledTime).getTime() : null;
  const isTrulyScheduled = schedTime && (schedTime - created) > (30 * 60 * 1000);

  if (isTrulyScheduled) {
    const diffMs = schedTime - now.getTime();
    const isLate = diffMs < 0;
    const absSec = Math.abs(Math.floor(diffMs / 1000));
    const mins = Math.floor(absSec / 60);
    const secs = absSec % 60;
    const text = `${isLate ? 'RETARD ' : 'DANS '}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    return (
      <div className={`flex items-center gap-1 px-1.5 py-0.5 2xl:px-3 2xl:py-1 rounded-none border font-black text-[11px] xl:text-sm 2xl:text-xl tracking-wider transition-all ${
        isLate ? 'bg-red-600 text-white animate-pulse border-red-400' : 'bg-purple-600 text-white border-transparent'
      }`}>
        <CalendarClock className="w-3 h-3 xl:w-4 xl:h-4 2xl:w-6 2xl:h-6" /> {text}
      </div>
    );
  }

  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - created) / 1000));
  const targetSeconds = (targetPrepMinutes || 15) * 60;
  const remainingSeconds = targetSeconds - elapsedSeconds;

  if (remainingSeconds >= 0) {
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    const text = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    const isWarning = remainingSeconds <= 3 * 60;
    const timeColorClass = isWarning 
      ? 'bg-orange-500 text-white border-transparent' 
      : 'bg-black/20 text-white border-transparent';

    return (
      <div className={`flex items-center gap-1 px-1.5 py-0.5 2xl:px-3 2xl:py-1 rounded-none border font-black text-[11px] xl:text-sm 2xl:text-xl tracking-wider transition-all ${timeColorClass}`}>
        <Timer className="w-3 h-3 xl:w-4 xl:h-4 2xl:w-6 2xl:h-6" /> {text}
      </div>
    );
  } else {
    const overtimeSeconds = Math.abs(remainingSeconds);
    const mins = Math.floor(overtimeSeconds / 60);
    const secs = overtimeSeconds % 60;
    const text = `+${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    return (
      <div className="flex items-center gap-1 px-1.5 py-0.5 2xl:px-3 2xl:py-1 rounded-none border font-black text-[11px] xl:text-sm 2xl:text-xl tracking-wider transition-all bg-red-600 text-white animate-pulse border-red-400">
        <Timer className="w-3 h-3 xl:w-4 xl:h-4 2xl:w-6 2xl:h-6" /> {text}
      </div>
    );
  }
};

// 🟢 ALGORITHME ZÉRO-TROU (Smart Column Backfill)
// Scanne colonne par colonne (Col 1 Haut, Col 1 Bas, Col 2 Haut, Col 2 Bas...) pour combler immédiatement les cases libres
const paginateNoHoles = (orders: any[]) => {
  if (!orders || orders.length === 0) return [[]];
  const pages: any[][] = [];
  const ROWS = 2;
  const COLS = 5;

  let currentGrid = Array(ROWS).fill(null).map(() => Array(COLS).fill(false));
  let currentPage: any[] = [];

  const canPlace = (grid: boolean[][], r: number, c: number, rSpan: number, cSpan: number) => {
    if (r + rSpan > ROWS || c + cSpan > COLS) return false;
    for (let dr = 0; dr < rSpan; dr++) {
      for (let dc = 0; dc < cSpan; dc++) {
        if (grid[r + dr][c + dc]) return false;
      }
    }
    return true;
  };

  const place = (grid: boolean[][], r: number, c: number, rSpan: number, cSpan: number) => {
    for (let dr = 0; dr < rSpan; dr++) {
      for (let dc = 0; dc < cSpan; dc++) {
        grid[r + dr][c + dc] = true;
      }
    }
  };

  orders.forEach(order => {
    const rSpan = Math.min(2, order.rowSpan || 1);
    const cSpan = Math.min(COLS, order.colSpan || 1);
    let placed = false;

    // Balayage en priorité de colonne : teste Col 0 Haut, Col 0 Bas, Col 1 Haut, Col 1 Bas...
    for (let c = 0; c <= COLS - cSpan; c++) {
      for (let r = 0; r <= ROWS - rSpan; r++) {
        if (canPlace(currentGrid, r, c, rSpan, cSpan)) {
          place(currentGrid, r, c, rSpan, cSpan);
          currentPage.push({
            ...order,
            gridRow: r + 1,
            gridCol: c + 1
          });
          placed = true;
          break;
        }
      }
      if (placed) break;
    }

    // Si aucune place sur la page courante, nouvelle page
    if (!placed) {
      if (currentPage.length > 0) {
        pages.push(currentPage);
      }
      currentGrid = Array(ROWS).fill(null).map(() => Array(COLS).fill(false));
      currentPage = [];

      for (let c = 0; c <= COLS - cSpan; c++) {
        for (let r = 0; r <= ROWS - rSpan; r++) {
          if (canPlace(currentGrid, r, c, rSpan, cSpan)) {
            place(currentGrid, r, c, rSpan, cSpan);
            currentPage.push({
              ...order,
              gridRow: r + 1,
              gridCol: c + 1
            });
            placed = true;
            break;
          }
        }
        if (placed) break;
      }

      if (!placed) {
        currentPage.push({
          ...order,
          gridRow: 1,
          gridCol: 1
        });
      }
    }
  });

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages.length > 0 ? pages : [[]];
};

const KDS = () => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [orders, setOrders] = useState<any[]>([]);
  const [missingIdError, setMissingIdError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [showAudioUnlock, setShowAudioUnlock] = useState(true);

  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  const [activeRestoId, setActiveRestoId] = useState(localStorage.getItem('pos_restaurant_id') || '');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isScheduledModalOpen, setIsScheduledModalOpen] = useState(false);
  
  const [forcedOrderIds, setForcedOrderIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState<number>(1);

  const [tempRestoId, setTempRestoId] = useState(activeRestoId);
  const [adminUnlockCount, setAdminUnlockCount] = useState(0);

  const [groupOptionsInline, setGroupOptionsInline] = useState<boolean>(() => {
    return localStorage.getItem('kds_group_options_inline') !== 'false';
  });

  const [productFontSize, setProductFontSize] = useState<string>(() => {
    return localStorage.getItem('kds_product_font_size') || 'normal';
  });

  const [optionFontSize, setOptionFontSize] = useState<string>(() => {
    return localStorage.getItem('kds_option_font_size') || 'normal';
  });

  const [themeColors, setThemeColors] = useState({ primary: '#FBBF24', secondary: '#1e293b' });
  const [targetPrepMinutes, setTargetPrepMinutes] = useState<number>(15);

  const [productDict, setProductDict] = useState<Record<string, string>>({});
  const [productNameDict, setProductNameDict] = useState<Record<string, string>>({});
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [dbHiddenCategories, setDbHiddenCategories] = useState<string[]>([]);

  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    JSON.parse(localStorage.getItem('kds_selected_categories') || '[]')
  );
  
  const [hiddenOptionNames, setHiddenOptionNames] = useState<string[]>([]);
  const [doneItems, setDoneItems] = useState<Record<string, boolean>>({});
  const [optionGroupMapping, setOptionGroupMapping] = useState<Record<string, string>>({});

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const loadMapping = async () => {
      if (orders.length === 0) return;
      const allItems = orders.flatMap(o => parseOrderDetails(o.order_details));
      const mapping = await fetchOptionGroupMapping(allItems, activeRestoId);
      setOptionGroupMapping(mapping);
    };
    loadMapping();
  }, [orders, activeRestoId]);

  const startLoopingSound = () => {
    if (!audioEnabled) return;
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio('/son.mp3');
        audioRef.current.volume = 1.0;
        audioRef.current.loop = true;
      }
      if (audioRef.current.paused) {
        audioRef.current.play().catch(e => console.error("Erreur lecture audio", e));
      }
    } catch (error) {
      console.error("Impossible de lancer le son en boucle", error);
    }
  };

  const stopLoopingSound = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  useEffect(() => {
    const hasNewOrders = orders.some(o => o.status?.toLowerCase() === 'nouvelle');
    if (hasNewOrders && audioEnabled) {
      startLoopingSound();
    } else {
      stopLoopingSound();
    }
  }, [orders, audioEnabled]);

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

  const unlockAudio = () => {
    setAudioEnabled(true);
    setShowAudioUnlock(false);
    toast.success("Son activé !");
  };

  const toggleAudioStatus = () => {
    if (audioEnabled) {
      setAudioEnabled(false);
      stopLoopingSound();
      toast.info("Son coupé");
    } else {
      setAudioEnabled(true);
      setShowAudioUnlock(false);
      toast.success("Son activé !");
    }
  };

  const toggleGroupOptionsInline = () => {
    setGroupOptionsInline(prev => {
      const next = !prev;
      localStorage.setItem('kds_group_options_inline', String(next));
      toast.success(next ? "Options groupées activées" : "1 option par ligne activée");
      return next;
    });
  };

  const handleChangeProductFontSize = (size: string) => {
    setProductFontSize(size);
    localStorage.setItem('kds_product_font_size', size);
    toast.success(`Police produit : ${PRODUCT_FONT_CONFIGS[size]?.label || size}`);
  };

  const handleChangeOptionFontSize = (size: string) => {
    setOptionFontSize(size);
    localStorage.setItem('kds_option_font_size', size);
    toast.success(`Police option : ${OPTION_FONT_CONFIGS[size]?.label || size}`);
  };

  const fetchTheme = async () => {
    if (!activeRestoId) return;
    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select('theme_primary, theme_secondary, prep_time_dine_in')
        .eq('id', activeRestoId)
        .single();
        
      if (data && !error) {
        setThemeColors({
          primary: data.theme_primary || '#FBBF24',
          secondary: data.theme_secondary || '#1e293b'
        });
        if (data.prep_time_dine_in !== undefined && data.prep_time_dine_in !== null) {
          setTargetPrepMinutes(Number(data.prep_time_dine_in) || 15);
        }
      }
    } catch (e) {
      console.error("Erreur chargement thème/prep_time", e);
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
        .select('id, name, product_overrides, target_category_name, target_subcategory_id')
        .eq('restaurant_id', activeRestoId)
        .eq('show_on_kds', false);

      if (!groups || groups.length === 0) {
        setHiddenOptionNames([]);
        return;
      }

      const namesToHide = new Set<string>();
      const groupIds: number[] = [];
      const productIdsToFetch = new Set<string>();
      const categoriesToFetch = new Set<string>();

      groups.forEach(g => {
        if (g.id) groupIds.push(g.id);
        if (g.name) namesToHide.add(g.name.toLowerCase().trim());

        if (g.product_overrides) {
          try {
            const overrides = typeof g.product_overrides === 'string'
              ? JSON.parse(g.product_overrides)
              : g.product_overrides;
            if (overrides && typeof overrides === 'object') {
              Object.keys(overrides).forEach(pId => {
                if (pId) productIdsToFetch.add(String(pId));
              });
            }
          } catch (e) {
            console.error("Erreur parse product_overrides:", e);
          }
        }

        if (g.target_category_name) {
          categoriesToFetch.add(g.target_category_name.toLowerCase().trim());
        }
      });

      if (groupIds.length > 0) {
        const { data: links } = await supabase
          .from('option_group_links')
          .select('option_id')
          .in('group_id', groupIds);

        if (links && links.length > 0) {
          const optionIds = links.map(l => l.option_id).filter(Boolean);
          if (optionIds.length > 0) {
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
        }
      }

      if (productIdsToFetch.size > 0) {
        const pIds = Array.from(productIdsToFetch);
        const { data: products } = await supabase
          .from('product')
          .select('name')
          .in('id', pIds);

        if (products) {
          products.forEach(p => {
            if (p.name) namesToHide.add(p.name.toLowerCase().trim());
          });
        }
      }

      if (categoriesToFetch.size > 0) {
        const { data: catProducts } = await supabase
          .from('product')
          .select('name, category')
          .eq('restaurant_id', activeRestoId);

        if (catProducts) {
          catProducts.forEach(p => {
            if (p.name && p.category && categoriesToFetch.has(p.category.toLowerCase().trim())) {
              namesToHide.add(p.name.toLowerCase().trim());
            }
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
        .select('id, status, created_at, scheduled_time, order_number, order_type_id, order_details, customer_name, customer_phone') 
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
        if (payload.eventType === 'DELETE') {
           setOrders(prev => prev.filter(o => o.id !== payload.old.id));
           return;
        }
        fetchOrders();
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
      stopLoopingSound();
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

  const handleForceSendToKitchen = (orderId: string | number) => {
    setForcedOrderIds(prev => new Set(prev).add(String(orderId)));
    setIsScheduledModalOpen(false);
    toast.success(`Commande #${orderId} envoyée en cuisine !`);
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
      case ORDER_TYPE_IDS.SUR_PLACE: return <span className="text-[9px] xl:text-xs 2xl:text-sm font-black text-blue-600 bg-white px-1.5 py-0.5 uppercase tracking-widest rounded-none shadow-sm">SP</span>;
      case ORDER_TYPE_IDS.EMPORTER: return <span className="text-[9px] xl:text-xs 2xl:text-sm font-black text-orange-600 bg-white px-1.5 py-0.5 uppercase tracking-widest rounded-none shadow-sm">EMP</span>;
      case ORDER_TYPE_IDS.LIVRAISON: return <span className="text-[9px] xl:text-xs 2xl:text-sm font-black text-purple-600 bg-white px-1.5 py-0.5 uppercase tracking-widest rounded-none shadow-sm">LIV</span>;
      default: return <span className="text-[9px] xl:text-xs 2xl:text-sm font-black text-gray-600 bg-white px-1.5 py-0.5 uppercase tracking-widest rounded-none shadow-sm">?</span>;
    }
  };

  const futureScheduledCount = useMemo(() => {
    return orders.filter(o => isActiveForKDS(o.status) && isRealScheduledOrder(o, now) && !forcedOrderIds.has(String(o.id))).length;
  }, [orders, now, forcedOrderIds]);

  const allDisplayOrders = useMemo(() => {
    const active = orders.filter(o => {
      if (!isActiveForKDS(o.status)) return false;
      if (isRealScheduledOrder(o, now) && !forcedOrderIds.has(String(o.id))) {
        return false;
      }
      return true;
    });

    const normSelectedCats = selectedCategories.map(c => normalizeText(c));
    const normDbHiddenCategories = dbHiddenCategories.map(c => normalizeText(c));
    
    return active.map(order => {
      const allItems = parseOrderDetails(order.order_details);
      
      const filteredItems = allItems.map((item: any) => {
        if (!item) return null;
        
        const productId = (item.product?.id || item.id || item.product_id || '').toString().trim();
        const baseProductId = productId.includes('-') ? productId.split('-')[0] : productId;
        
        const itemInternalName = (item.product?.name || item.name || '').toLowerCase().trim();
        
        let rawCategory = productDict[baseProductId] || productDict[productId] || productNameDict[itemInternalName] || item.product?.category || item.product?.category_id || item.category || item.category_id || '';
        
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

        if (!mainCategoryNorm) return item;
        if (normDbHiddenCategories.includes(mainCategoryNorm)) return null;
        if (normSelectedCats.length > 0 && !normSelectedCats.includes(mainCategoryNorm)) return null;

        return { ...item };
      }).filter(Boolean);

      const groupedItems: any[] = [];
      filteredItems.forEach((item: any) => {
        const productName = item.product?.name || item.name || 'Produit inconnu';
        const qty = item.quantity || 1;
        
        const optionRows = extractOptionLinesForKDS(item, hiddenOptionNames, optionGroupMapping, groupOptionsInline);
        const sig = `${productName}|${optionRows.map(r => r.items.map(o => `${o.isSans ? 'sans:' : ''}${o.name}`).join(',')).join('|')}`;
        
        const existing = groupedItems.find(g => g.sig === sig);
        if (existing) {
          existing.qty += qty;
        } else {
          groupedItems.push({ productName, qty, optionRows, sig });
        }
      });

      const flatLines: any[] = [];
      groupedItems.forEach((gItem: any) => {
        const itemKey = `${order.id}-${gItem.sig}`;
        
        flatLines.push({
          id: `${itemKey}-prod`,
          isProduct: true,
          qty: gItem.qty,
          name: gItem.productName,
          sig: gItem.sig,
          itemKey,
          hasOptions: gItem.optionRows.length > 0
        });
        
        gItem.optionRows.forEach((row: any, rIdx: number) => {
          flatLines.push({
            id: `${itemKey}-row-${rIdx}`,
            isProduct: false,
            items: row.items,
            isSans: row.isSans,
            groupIdx: row.groupIdx,
            sig: gItem.sig,
            itemKey,
            isLast: rIdx === gItem.optionRows.length - 1
          });
        });
      });

      const totalLines = flatLines.length;

      let rowSpan = 1;
      let colSpan = 1;
      let linesPerColumn = LINES_PER_SINGLE_ROW;

      if (totalLines > LINES_PER_SINGLE_ROW && totalLines <= LINES_PER_DOUBLE_ROW) {
        rowSpan = 2;
        colSpan = 1;
        linesPerColumn = LINES_PER_DOUBLE_ROW;
      } else if (totalLines > LINES_PER_DOUBLE_ROW) {
        rowSpan = 2;
        colSpan = Math.min(5, Math.ceil(totalLines / LINES_PER_DOUBLE_ROW));
        linesPerColumn = LINES_PER_DOUBLE_ROW;
      }

      const chunks = chunkArrayByLines(flatLines, linesPerColumn);

      return { 
        ...order, 
        groupedItems, 
        flatLines, 
        chunks, 
        rowSpan, 
        colSpan, 
        linesPerColumn 
      };
    }).filter(order => order.groupedItems.length > 0);
  }, [orders, selectedCategories, productDict, productNameDict, hiddenOptionNames, dbHiddenCategories, availableCategories, optionGroupMapping, groupOptionsInline, forcedOrderIds, now]);

  // 🟢 UTILISATION DU NOUVEL ALGORITHME ZÉRO-TROU
  const paginatedPages = useMemo(() => {
    return paginateNoHoles(allDisplayOrders);
  }, [allDisplayOrders]);

  const totalPages = paginatedPages.length;
  const currentOrders = paginatedPages[currentPage - 1] || [];

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(Math.max(1, totalPages));
    }
  }, [totalPages, currentPage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setCurrentPage(p => Math.max(1, p - 1));
      } else if (e.key === 'ArrowRight') {
        setCurrentPage(p => Math.min(totalPages, p + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalPages]);

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

  const toggleItemDone = (lineId: string) => {
    setDoneItems(prev => ({
      ...prev,
      [lineId]: !prev[lineId]
    }));
  };

  const currentProductFont = PRODUCT_FONT_CONFIGS[productFontSize] || PRODUCT_FONT_CONFIGS.normal;
  const currentOptionFont = OPTION_FONT_CONFIGS[optionFontSize] || OPTION_FONT_CONFIGS.normal;

  return (
    <div 
      className="h-[100dvh] w-full bg-secondary text-white font-helvetica flex flex-col overflow-hidden relative select-none rounded-none" 
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
            0% { border-color: #ef4444; box-shadow: inset 0 0 0 2px #ef4444; }
            50% { border-color: #fca5a5; box-shadow: inset 0 0 0 4px #ef4444; }
            100% { border-color: #ef4444; box-shadow: inset 0 0 0 2px #ef4444; }
          }
          .animate-alert { animation: alert-blink 0.8s ease-in-out infinite; }
        `}
      </style>

      {showAudioUnlock && !missingIdError && (
        <button 
          onClick={unlockAudio} 
          className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-none font-black animate-bounce shadow-2xl z-50 flex items-center gap-3 border-2 border-white cursor-pointer"
        >
          <VolumeX size={24} /> CLIQUEZ ICI POUR ACTIVER LE SON
        </button>
      )}

      {isOffline && (
        <div className="absolute top-0 left-0 right-0 bg-red-600 text-white text-center py-1 2xl:py-2 font-black uppercase tracking-widest text-[10px] 2xl:text-base flex justify-center items-center gap-1.5 z-50 animate-pulse">
          <WifiOff className="w-3 h-3 2xl:w-5 2xl:h-5" /> Hors ligne ! KDS non synchronisé.
        </div>
      )}

      {/* BANDEAU SUPÉRIEUR AVEC PAGINATION */}
      <div className={`flex justify-between items-center px-3 py-1.5 2xl:px-5 2xl:py-2.5 bg-secondary border-b border-black/40 z-10 flex-shrink-0 ${isOffline ? 'mt-6 2xl:mt-10' : ''}`}>
        <div className="flex items-center gap-2 2xl:gap-4">
          <span className="text-[12px] xl:text-sm 2xl:text-xl font-black uppercase tracking-widest text-white/50">
            {selectedCategories.length > 0 || dbHiddenCategories.length > 0 ? "KDS (FILTRÉ)" : "KDS"}
          </span>
          {!missingIdError && (
            <span className="text-[11px] xl:text-xs 2xl:text-lg font-bold bg-white/10 px-2 py-0.5 2xl:px-3 2xl:py-1 rounded-none text-white/80">
              {allDisplayOrders.length} en cours
            </span>
          )}

          {/* SÉLECTEUR DE PAGINATION SANS SCROLL */}
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-none overflow-hidden shadow-inner ml-1">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              className="px-2 py-1 2xl:px-3 2xl:py-1.5 hover:bg-white/10 active:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent text-white transition-colors flex items-center justify-center cursor-pointer disabled:cursor-not-allowed"
              title="Page précédente (Flèche gauche)"
            >
              <ChevronLeft className="w-4 h-4 2xl:w-6 2xl:h-6" />
            </button>
            <span className="px-2.5 py-0.5 font-black text-xs 2xl:text-base text-amber-400 tracking-wider">
              {currentPage} / {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              className="px-2 py-1 2xl:px-3 2xl:py-1.5 hover:bg-white/10 active:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent text-white transition-colors flex items-center justify-center cursor-pointer disabled:cursor-not-allowed"
              title="Page suivante (Flèche droite)"
            >
              <ChevronRight className="w-4 h-4 2xl:w-6 2xl:h-6" />
            </button>
          </div>

          <button 
            onClick={() => setIsScheduledModalOpen(true)}
            className={`px-2.5 py-1 2xl:px-4 2xl:py-1.5 rounded-none font-black text-xs 2xl:text-base uppercase flex items-center gap-2 transition-all cursor-pointer ${
              futureScheduledCount > 0 
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md' 
                : 'bg-white/5 hover:bg-white/10 text-white/70'
            }`}
            title="Voir les commandes programmées à l'avance"
          >
            <CalendarClock className="w-4 h-4 2xl:w-5 2xl:h-5" />
            <span>Programmées</span>
            {futureScheduledCount > 0 && (
              <span className="bg-slate-950 text-amber-400 text-[10px] 2xl:text-xs px-1.5 py-0.2 rounded-none">
                {futureScheduledCount}
              </span>
            )}
          </button>
          
          <button onClick={() => setIsHistoryOpen(true)} className="bg-white/5 hover:bg-white/10 p-1.5 2xl:p-3 rounded-none transition-colors relative ml-1" title="Historique">
            <History className="w-4 h-4 xl:w-5 xl:h-5 2xl:w-8 2xl:h-8 text-primary" />
            {historyOrders.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-emerald-500 text-slate-900 text-[9px] 2xl:text-sm font-black px-1 2xl:px-2 rounded-none">
                {historyOrders.length}
              </span>
            )}
          </button>

          <button onClick={toggleAudioStatus} className={`p-1.5 2xl:p-3 rounded-none ml-1 cursor-pointer transition-colors ${audioEnabled ? 'bg-emerald-500/10' : 'bg-red-500/10 animate-pulse'}`} title="Son">
            {audioEnabled ? <Volume2 className="w-4 h-4 xl:w-5 xl:h-5 2xl:w-8 2xl:h-8 text-primary" /> : <VolumeX className="w-4 h-4 xl:w-5 xl:h-5 2xl:w-8 2xl:h-8 text-primary" />}
          </button>
        </div>

        <div className="flex items-center gap-2 2xl:gap-4">
          <div className="w-px h-5 2xl:h-8 bg-white/20 mx-1 2xl:mx-3"></div>
          <button onClick={() => { fetchOrders(); fetchHiddenOptions(); }} className="bg-white/5 hover:bg-white/10 p-1.5 2xl:p-3 rounded-none transition-colors">
            <RefreshCcw className={`w-4 h-4 xl:w-5 xl:h-5 2xl:w-8 2xl:h-8 ${isLoading ? "animate-spin text-primary/70" : "text-primary"}`} />
          </button>
          <button onClick={() => setIsSettingsOpen(true)} className="bg-white/5 hover:bg-white/10 p-1.5 2xl:p-3 rounded-none transition-colors">
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
        /* GRILLE STRICTEMENT VERROUILLÉE À 5 COLONNES x 2 RANGÉES (ZÉRO TROU / ZÉRO ÉCRASEMENT) */
        <div className="flex-1 w-full overflow-hidden bg-slate-950">
          <div 
            className="grid w-full h-full gap-0"
            style={{
              gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
              gridTemplateRows: 'repeat(2, minmax(0, 1fr))'
            }}
          >
            {currentOrders.map((order) => {
              const status = order.status?.toLowerCase() || '';
              const isNewOrder = status === 'nouvelle';

              let headerBgClass = 'bg-gray-600'; 
              if (order.order_type_id === ORDER_TYPE_IDS.SUR_PLACE) {
                headerBgClass = 'bg-[#E65100]'; 
              } else if (order.order_type_id === ORDER_TYPE_IDS.EMPORTER) {
                headerBgClass = 'bg-[#A0612D]'; 
              } else if (order.order_type_id === ORDER_TYPE_IDS.LIVRAISON) {
                headerBgClass = 'bg-[#1976D2]'; 
              }

              const cardBorderClass = isNewOrder 
                ? 'border-[2.5px] border-red-500 animate-alert z-20' 
                : 'border-[2px] border-slate-900 z-10';

              return (
                <div 
                  key={order.id} 
                  style={{
                    gridRow: `${order.gridRow} / span ${order.rowSpan}`,
                    gridColumn: `${order.gridCol} / span ${order.colSpan}`
                  }}
                  className={`bg-slate-100 flex flex-col overflow-hidden rounded-none h-full ${cardBorderClass}`}
                >
                  {/* EN-TÊTE DU TICKET */}
                  <div className={`${headerBgClass} px-2 py-1.5 2xl:px-3 2xl:py-2 flex justify-between items-center border-b border-black/30 flex-shrink-0 z-10`}>
                    <div className="flex items-center gap-1.5 2xl:gap-2">
                      {isNewOrder && <BellRing className="w-3.5 h-3.5 2xl:w-6 2xl:h-6 text-white animate-bounce" />}
                      {getOrderTypeBadge(order.order_type_id)}
                    </div>
                    <OrderTimer 
                      createdAt={order.created_at} 
                      now={now} 
                      scheduledTime={order.scheduled_time} 
                      targetPrepMinutes={targetPrepMinutes}
                    />
                    <div className="text-[13px] xl:text-base 2xl:text-2xl font-black text-slate-900 bg-white px-2 py-0.5 2xl:px-2.5 rounded-none shadow-sm">
                      {order.order_number || `#${order.id.toString().slice(-3)}`}
                    </div>
                  </div>

                  {/* CONTENEUR DES ARTICLES */}
                  <div className="flex-1 overflow-hidden bg-slate-50 p-0.5">
                    <div 
                      className="grid h-full" 
                      style={{ 
                        gridTemplateColumns: `repeat(${order.colSpan}, minmax(0, 1fr))`,
                        gridAutoRows: '100%',
                        gap: '0px' 
                      }}
                    >
                      {order.chunks.map((columnLines: any[], colIdx: number) => (
                        <div 
                          key={`col-${colIdx}`} 
                          className={`grid w-full h-full px-0.5 ${colIdx > 0 ? 'border-l-2 border-dashed border-slate-300' : ''}`}
                          style={{ gridTemplateRows: `repeat(${order.linesPerColumn}, minmax(0, 1fr))` }}
                        >
                          {columnLines.map((line: any, lineIdx: number) => {
                            const isDone = !!doneItems[line.id];
                            const isChunkFirst = lineIdx === 0;
                            const isChunkLast = lineIdx === columnLines.length - 1;

                            // 1. LIGNE PRODUIT
                            if (line.isProduct) {
                              return (
                                <div 
                                  key={line.id}
                                  onClick={() => toggleItemDone(line.id)}
                                  className={`min-h-0 w-full overflow-hidden flex items-center px-1.5 2xl:px-2.5 cursor-pointer transition-colors border-x border-slate-300 rounded-none ${isChunkFirst ? 'border-t' : ''} ${(!line.hasOptions || isChunkLast) ? 'border-b border-slate-400 shadow-sm' : 'border-b border-slate-200'} ${isDone ? 'bg-emerald-500' : 'bg-white'}`}
                                >
                                  <span className={`px-1.5 py-0.5 rounded-none ${currentProductFont.qtyClass} font-black mr-1.5 2xl:mr-2 flex-shrink-0 leading-none ${isDone ? 'bg-emerald-700 text-white' : 'bg-slate-900 text-white'}`}>
                                    {line.qty}x
                                  </span>
                                  <span className={`${currentProductFont.textClass} font-black uppercase leading-tight truncate ${isDone ? 'text-emerald-950' : 'text-slate-950'}`}>
                                    {line.name}
                                  </span>
                                </div>
                              );
                            } 
                            
                            // 2. LIGNE OPTION
                            else {
                              let bgClass = (line.groupIdx % 2 === 0) ? 'bg-[#0f172a]' : 'bg-[#475569]';
                              let textClass = 'text-white';
                              let iconColor = (line.groupIdx % 2 === 0) ? 'text-amber-400' : 'text-cyan-300';
                              let dividerClass = 'border-r border-white/20';
                              
                              if (isDone) {
                                bgClass = 'bg-emerald-400';
                                textClass = 'text-emerald-950';
                                iconColor = 'text-emerald-950';
                                dividerClass = 'border-r border-emerald-800/40';
                              } else if (line.isSans) {
                                bgClass = 'bg-red-600';
                                textClass = 'text-white';
                                iconColor = 'text-white';
                                dividerClass = 'border-r border-white/30';
                              }

                              const itemsList = line.items && line.items.length > 0 ? line.items : [];

                              let optFontSizeClass = currentOptionFont.single;
                              let optPaddingClass = "px-1.5 2xl:px-2";

                              if (itemsList.length === 2) {
                                optFontSizeClass = currentOptionFont.double;
                                optPaddingClass = "px-1";
                              } else if (itemsList.length >= 3) {
                                optFontSizeClass = currentOptionFont.triple;
                                optPaddingClass = "px-0.5";
                              }

                              return (
                                <div 
                                  key={line.id} 
                                  onClick={() => toggleItemDone(line.id)}
                                  className={`min-h-0 w-full overflow-hidden flex items-stretch cursor-pointer transition-colors border-x border-slate-300 rounded-none border-b border-black/40 ${bgClass} ${isChunkFirst ? 'border-t' : ''} ${isChunkLast ? 'shadow-sm' : ''}`}
                                >
                                  {itemsList.map((opt: any, optIdx: number) => (
                                    <div 
                                      key={optIdx} 
                                      className={`flex-1 min-w-0 flex items-center justify-start ${optPaddingClass} h-full gap-1 ${optIdx < itemsList.length - 1 ? dividerClass : ''}`}
                                    >
                                      <span className={`text-[9px] xl:text-[10px] 2xl:text-[13px] font-black flex-shrink-0 leading-none ${iconColor}`}>
                                        {opt.isSans ? '✕' : '+'}
                                      </span>
                                      <span className={`${optFontSizeClass} font-black uppercase leading-tight truncate w-full ${textClass}`}>
                                        {opt.qty > 1 ? `${opt.qty}x ` : ''}{opt.name}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              );
                            }
                          })}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* BOUTON D'ACTION INFÉRIEUR */}
                  <div className="flex-shrink-0 border-t border-slate-900 z-10">
                    {isNewOrder ? (
                      <button onClick={() => acceptOrder(order.id)} className="w-full bg-red-600 hover:bg-red-700 active:scale-[0.99] text-white font-black text-[11px] xl:text-sm 2xl:text-xl uppercase tracking-widest py-1.5 2xl:py-3 transition-all flex justify-center items-center gap-1.5 2xl:gap-3 rounded-none">
                        <BellRing className="w-3.5 h-3.5 2xl:w-6 2xl:h-6" /> Accepter
                      </button>
                    ) : (
                      <button onClick={() => markOrderAsReady(order.id)} className="w-full bg-emerald-500 hover:bg-emerald-600 active:scale-[0.99] text-slate-900 font-black text-[11px] xl:text-sm 2xl:text-xl uppercase tracking-widest py-1.5 2xl:py-3 transition-all flex justify-center items-center gap-1.5 2xl:gap-3 rounded-none">
                        <CheckCircle2 className="w-4 h-4 2xl:w-6 2xl:h-6" strokeWidth={3} /> Prêt
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- MODAL COMMANDES PROGRAMMÉES --- */}
      <ScheduledOrdersModal
        isOpen={isScheduledModalOpen}
        onClose={() => setIsScheduledModalOpen(false)}
        orders={orders.filter(o => isActiveForKDS(o.status))}
        onForceSendToKitchen={handleForceSendToKitchen}
        themeColors={themeColors}
      />

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
                          <span className={`px-2 py-0.5 2xl:px-3 2xl:py-1 text-[9px] 2xl:text-sm font-black uppercase rounded-none ${isClosed ? 'bg-white/10 text-white/50' : 'bg-emerald-500/20 text-emerald-400'}`}>{order.status}</span>
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

            <div className="p-4 2xl:p-8 space-y-6 2xl:space-y-8 overflow-y-auto max-h-[75vh] custom-scrollbar">
              
              {(!activeRestoId || adminUnlockCount >= 5) && (
                <div>
                  <label className="block text-[11px] 2xl:text-lg font-bold text-emerald-500 uppercase mb-2 2xl:mb-4">ID du Restaurant</label>
                  <div className="flex gap-2 2xl:gap-4">
                    <input type="text" value={tempRestoId} onChange={(e) => setTempRestoId(e.target.value)} className="flex-1 bg-black/50 border border-white/20 px-3 py-2 2xl:px-6 2xl:py-4 text-white text-xs 2xl:text-xl rounded-none focus:outline-none focus:border-emerald-500" />
                    <button onClick={handleSaveSettings} className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-black uppercase px-4 py-2 2xl:px-8 2xl:py-4 text-[11px] 2xl:text-xl rounded-none">Sauver</button>
                  </div>
                </div>
              )}

              {/* 1. TAILLE POLICE PRODUIT */}
              <div className="border-t border-white/10 pt-4 2xl:pt-6">
                <h3 className="text-xs 2xl:text-xl font-black uppercase text-white mb-3 flex items-center gap-1.5 2xl:gap-3">
                  <Type className="w-3.5 h-3.5 2xl:w-6 2xl:h-6 text-amber-500"/> Taille police des produits
                </h3>
                <div className="grid grid-cols-4 gap-2 2xl:gap-3">
                  {Object.entries(PRODUCT_FONT_CONFIGS).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => handleChangeProductFontSize(key)}
                      className={`py-2 2xl:py-3 px-2 font-black text-[11px] 2xl:text-base uppercase rounded-none transition-colors border ${
                        productFontSize === key
                          ? 'bg-amber-500 text-slate-900 border-amber-500'
                          : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. TAILLE POLICE OPTIONS */}
              <div className="border-t border-white/10 pt-4 2xl:pt-6">
                <h3 className="text-xs 2xl:text-xl font-black uppercase text-white mb-3 flex items-center gap-1.5 2xl:gap-3">
                  <Type className="w-3.5 h-3.5 2xl:w-6 2xl:h-6 text-cyan-400"/> Taille police des options
                </h3>
                <div className="grid grid-cols-3 gap-2 2xl:gap-3">
                  {Object.entries(OPTION_FONT_CONFIGS).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => handleChangeOptionFontSize(key)}
                      className={`py-2 2xl:py-3 px-2 font-black text-[11px] 2xl:text-base uppercase rounded-none transition-colors border ${
                        optionFontSize === key
                          ? 'bg-cyan-400 text-slate-900 border-cyan-400'
                          : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* DISPOSITION DES OPTIONS KDS */}
              <div className="border-t border-white/10 pt-4 2xl:pt-6">
                <h3 className="text-xs 2xl:text-xl font-black uppercase text-white mb-2 2xl:mb-4 flex items-center gap-1.5 2xl:gap-3">
                  <LayoutGrid className="w-3.5 h-3.5 2xl:w-6 2xl:h-6 text-amber-500"/> Disposition des options
                </h3>
                <div className="flex items-center justify-between bg-white/5 p-3 2xl:p-5 border border-white/10 rounded-none">
                  <div className="pr-4">
                    <div className="text-xs 2xl:text-lg font-bold text-white uppercase">
                      Grouper les options d'un même groupe
                    </div>
                    <div className="text-[10px] 2xl:text-sm text-white/50 mt-0.5">
                      {groupOptionsInline 
                        ? "Activé : Les options d'un même groupe s'affichent côte à côte avec police auto-adaptée." 
                        : "Désactivé : Chaque option occupe sa propre ligne pleine largeur (lisibilité maximale)."}
                    </div>
                  </div>
                  <button
                    onClick={toggleGroupOptionsInline}
                    className={`px-4 py-2 2xl:px-6 2xl:py-3 font-black text-xs 2xl:text-base uppercase rounded-none transition-colors shrink-0 ${
                      groupOptionsInline 
                        ? 'bg-emerald-500 text-slate-900' 
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {groupOptionsInline ? 'ACTIVÉ' : 'DÉSACTIVÉ'}
                  </button>
                </div>
              </div>

              {/* FILTRES PAR CATÉGORIE */}
              <div className="border-t border-white/10 pt-4 2xl:pt-6">
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