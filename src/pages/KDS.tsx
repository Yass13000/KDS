// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { 
  Clock, 
  CheckCircle2, 
  Timer, 
  BellRing, 
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
  ChevronRight, 
  Smartphone, 
  Monitor, 
  QrCode, 
  KeyRound, 
  Unlink 
} from 'lucide-react';
import { getFormattedOrderOptions, fetchOptionGroupMapping } from '@/lib/orderFormatter';
import { ScheduledOrdersModal } from '@/components/ScheduledOrdersModal';

const ORDER_TYPE_IDS = {
  SUR_PLACE: '633425b1-f86c-4c17-8cba-b258906ad317',
  EMPORTER: '2cac3f10-73e2-40a5-a7e0-053bd861b4d9',
  LIVRAISON: 'c48b80a4-0dcd-4f75-9e67-a99d30bf4f9d'
};

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

// POLICES FLUIDES ADAPTÉES AU VIEWPORT (ZÉRO PX FIXE)
const PRODUCT_FONT_CONFIGS: Record<string, { label: string; textClass: string; qtyClass: string }> = {
  small: { 
    label: 'Petite', 
    textClass: 'text-[clamp(12px,1.3vh,18px)] leading-tight', 
    qtyClass: 'text-[clamp(11px,1.2vh,16px)]' 
  },
  normal: { 
    label: 'Normale', 
    textClass: 'text-[clamp(14px,1.65vh,23px)] leading-tight', 
    qtyClass: 'text-[clamp(13px,1.45vh,20px)]' 
  },
  large: { 
    label: 'Grande', 
    textClass: 'text-[clamp(16px,1.95vh,27px)] leading-tight', 
    qtyClass: 'text-[clamp(15px,1.75vh,23px)]' 
  },
  xlarge: { 
    label: 'Très grande', 
    textClass: 'text-[clamp(18px,2.3vh,32px)] leading-tight', 
    qtyClass: 'text-[clamp(17px,2.05vh,27px)]' 
  }
};

const OPTION_FONT_CONFIGS: Record<string, { label: string; single: string; double: string; triple: string }> = {
  small: {
    label: 'Petite',
    single: 'text-[clamp(11px,1.2vh,16px)] leading-tight',
    double: 'text-[clamp(10px,1.1vh,15px)] tracking-tight leading-tight',
    triple: 'text-[clamp(9.5px,1.0vh,13.5px)] tracking-tighter leading-none'
  },
  normal: {
    label: 'Normale',
    single: 'text-[clamp(13px,1.45vh,19px)] leading-tight',
    double: 'text-[clamp(11.5px,1.25vh,17px)] tracking-tight leading-tight',
    triple: 'text-[clamp(10.5px,1.15vh,15px)] tracking-tighter leading-none'
  },
  large: {
    label: 'Grande',
    single: 'text-[clamp(15px,1.7vh,23px)] leading-tight',
    double: 'text-[clamp(13.5px,1.45vh,19px)] tracking-tight leading-tight',
    triple: 'text-[clamp(12px,1.3vh,17px)] tracking-tighter leading-none'
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
    } catch { return []; }
  }
  return [];
};

// EXTRACTION DES LIGNES D'OPTIONS AVEC SORT_KDS ET NAME_KDS
const extractOptionLinesForKDS = (
  item: any, 
  hiddenOptionNames: string[] = [], 
  groupMapping: Record<string, string> = {},
  groupInline: boolean = true,
  groupSortDict: Record<string, number> = {},
  optionNameKdsDict: Record<string, string> = {},
  productKdsDict: Record<string, string> = {}
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

  const getOptionDisplayName = (opt: any): string => {
    if (!opt) return '';
    if (opt.name_kds && String(opt.name_kds).trim()) {
      return String(opt.name_kds).trim();
    }
    const rawName = opt.name || '';
    const normName = normalizeText(rawName);
    const cleanNormName = normName.replace(/^sans\s+/, '');

    if (optionNameKdsDict[normName]) return optionNameKdsDict[normName];
    if (cleanNormName && optionNameKdsDict[cleanNormName]) return optionNameKdsDict[cleanNormName];

    const optId = (opt.id || opt.product_id || '').toString().trim();
    const baseOptId = optId.includes('-') ? optId.split('-')[0] : optId;
    if (baseOptId && productKdsDict[baseOptId]) return productKdsDict[baseOptId];
    if (optId && productKdsDict[optId]) return productKdsDict[optId];
    if (normName && productKdsDict[normName]) return productKdsDict[normName];
    if (cleanNormName && productKdsDict[cleanNormName]) return productKdsDict[cleanNormName];

    return rawName;
  };

  const resultRows: { items: { name: string; qty: number; isSans: boolean }[]; isSans: boolean; groupIdx: number }[] = [];
  let groupCounter = 0;

  const optionGroups = getFormattedOrderOptions(item, groupMapping);

  const sansItems: { name: string; qty: number; isSans: boolean }[] = [];
  const normalGroups: { groupName: string; sortOrder: number; items: { name: string; qty: number; isSans: boolean }[] }[] = [];

  optionGroups.forEach(grp => {
    if ((grp.originalGroupName && isHidden(grp.originalGroupName)) || (grp.groupName && isHidden(grp.groupName))) {
      return;
    }

    const validItems = (grp.items || []).filter(opt => opt && opt.name && !isHidden(opt.name));
    if (validItems.length === 0) return;

    validItems.forEach(opt => {
      const displayName = getOptionDisplayName(opt);
      if (opt.isSans || grp.originalGroupName === 'INGRÉDIENTS') {
        const cleanSansName = displayName.replace(/^sans\s+/i, '');
        sansItems.push({ name: cleanSansName, qty: opt.qty || 1, isSans: true });
      }
    });

    const nonSansItems = validItems.filter(opt => !opt.isSans && grp.originalGroupName !== 'INGRÉDIENTS');
    if (nonSansItems.length > 0) {
      const rawGroupName = grp.originalGroupName || grp.groupName || '';
      const normGroupName = normalizeText(rawGroupName);
      const sortOrder = groupSortDict[normGroupName] ?? 999;

      normalGroups.push({
        groupName: rawGroupName,
        sortOrder,
        items: nonSansItems.map(opt => ({ 
          name: getOptionDisplayName(opt), 
          qty: opt.qty || 1, 
          isSans: false 
        }))
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

  normalGroups.sort((a, b) => a.sortOrder - b.sortOrder);

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
  const s = status?.trim().toLowerCase() || '';
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
    <div className="text-[clamp(13px,1.55vh,19px)] font-black tracking-widest text-white/90 flex items-center gap-2 ml-1">
      <Clock className="w-[2.2vh] h-[2.2vh] min-w-[20px] min-h-[20px] text-primary" />
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
      <div className={`flex items-center gap-1 px-[0.6vw] py-[0.3vh] rounded-none border font-black text-[clamp(11px,1.3vh,18px)] tracking-wider transition-all ${
        isLate ? 'bg-red-600 text-white animate-pulse border-red-400' : 'bg-purple-600 text-white border-transparent'
      }`}>
        <CalendarClock className="w-[1.5vh] h-[1.5vh]" /> {text}
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
      <div className={`flex items-center gap-1 px-[0.6vw] py-[0.3vh] rounded-none border font-black text-[clamp(11px,1.3vh,18px)] tracking-wider transition-all ${timeColorClass}`}>
        <Timer className="w-[1.5vh] h-[1.5vh]" /> {text}
      </div>
    );
  } else {
    const overtimeSeconds = Math.abs(remainingSeconds);
    const mins = Math.floor(overtimeSeconds / 60);
    const secs = overtimeSeconds % 60;
    const text = `+${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    return (
      <div className="flex items-center gap-1 px-[0.6vw] py-[0.3vh] rounded-none border font-black text-[clamp(11px,1.3vh,18px)] tracking-wider transition-all bg-red-600 text-white animate-pulse border-red-400">
        <Timer className="w-[1.5vh] h-[1.5vh]" /> {text}
      </div>
    );
  }
};

// ==========================================
// ALGORITHMES DE PLACEMENT
// ==========================================

const paginate5x1 = (orders: any[]) => {
  if (!orders || orders.length === 0) return [[]];
  const pages: any[][] = [];
  const TOTAL_COLS = 5;

  let currentPage: any[] = [];
  let currentUsedCols = 0;

  orders.forEach(order => {
    const cSpan = Math.min(TOTAL_COLS, order.colSpan || 1);

    if (currentUsedCols + cSpan > TOTAL_COLS) {
      if (currentPage.length > 0) pages.push(currentPage);
      currentPage = [];
      currentUsedCols = 0;
    }

    currentPage.push({
      ...order,
      gridColStart: currentUsedCols + 1,
      gridRowStart: 1,
      rowSpan: 1,
      colSpan: cSpan
    });
    currentUsedCols += cSpan;
  });

  if (currentPage.length > 0) pages.push(currentPage);
  return pages.length > 0 ? pages : [[]];
};

const paginate5x2 = (orders: any[]) => {
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
    const rSpan = Math.min(ROWS, order.rowSpan || 1);
    const cSpan = Math.min(COLS, order.colSpan || 1);
    let placed = false;

    for (let c = 0; c <= COLS - cSpan; c++) {
      for (let r = 0; r <= ROWS - rSpan; r++) {
        if (canPlace(currentGrid, r, c, rSpan, cSpan)) {
          place(currentGrid, r, c, rSpan, cSpan);
          currentPage.push({
            ...order,
            gridRowStart: r + 1,
            gridColStart: c + 1,
            rowSpan: rSpan,
            colSpan: cSpan
          });
          placed = true;
          break;
        }
      }
      if (placed) break;
    }

    if (!placed) {
      if (currentPage.length > 0) pages.push(currentPage);
      currentGrid = Array(ROWS).fill(null).map(() => Array(COLS).fill(false));
      currentPage = [];

      for (let c = 0; c <= COLS - cSpan; c++) {
        for (let r = 0; r <= ROWS - rSpan; r++) {
          if (canPlace(currentGrid, r, c, rSpan, cSpan)) {
            place(currentGrid, r, c, rSpan, cSpan);
            currentPage.push({
              ...order,
              gridRowStart: r + 1,
              gridColStart: c + 1,
              rowSpan: rSpan,
              colSpan: cSpan
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
          gridRowStart: 1,
          gridColStart: 1,
          rowSpan: 1,
          colSpan: 1
        });
      }
    }
  });

  if (currentPage.length > 0) pages.push(currentPage);
  return pages.length > 0 ? pages : [[]];
};

const paginatePortrait = (orders: any[]) => {
  if (!orders || orders.length === 0) return [[]];
  const pages: any[][] = [];
  const ROWS = 3;
  const COLS = 2;

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
    const rSpan = Math.min(ROWS, order.rowSpan || 1);
    const cSpan = Math.min(COLS, order.colSpan || 1);
    let placed = false;

    for (let r = 0; r <= ROWS - rSpan; r++) {
      for (let c = 0; c <= COLS - cSpan; c++) {
        if (canPlace(currentGrid, r, c, rSpan, cSpan)) {
          place(currentGrid, r, c, rSpan, cSpan);
          currentPage.push({
            ...order,
            gridRowStart: r + 1,
            gridColStart: c + 1,
            rowSpan: rSpan,
            colSpan: cSpan
          });
          placed = true;
          break;
        }
      }
      if (placed) break;
    }

    if (!placed) {
      if (currentPage.length > 0) pages.push(currentPage);
      currentGrid = Array(ROWS).fill(null).map(() => Array(COLS).fill(false));
      currentPage = [];

      for (let r = 0; r <= ROWS - rSpan; r++) {
        for (let c = 0; c <= COLS - cSpan; c++) {
          if (canPlace(currentGrid, r, c, rSpan, cSpan)) {
            place(currentGrid, r, c, rSpan, cSpan);
            currentPage.push({
              ...order,
              gridRowStart: r + 1,
              gridColStart: c + 1,
              rowSpan: rSpan,
              colSpan: cSpan
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
          gridRowStart: 1,
          gridColStart: 1,
          rowSpan: 1,
          colSpan: 1
        });
      }
    }
  });

  if (currentPage.length > 0) pages.push(currentPage);
  return pages.length > 0 ? pages : [[]];
};

const KDS = () => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [orders, setOrders] = useState<any[]>([]);
  const [, setMissingIdError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [showAudioUnlock, setShowAudioUnlock] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  const [activeRestoId, setActiveRestoId] = useState(() => {
    return localStorage.getItem('pos_restaurant_id') || 
           localStorage.getItem('admin_override_restaurant_id') || 
           '';
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isScheduledModalOpen, setIsScheduledModalOpen] = useState(false);
  
  const generateRandomPairingCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const [pairingCode, setPairingCode] = useState<string>(() => generateRandomPairingCode());
  const [deviceId] = useState<string>(() => {
    let id = localStorage.getItem('kds_device_id');
    if (!id) {
      id = `kds_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`;
      localStorage.setItem('kds_device_id', id);
    }
    return id;
  });

  const [isUnlinkModalOpen, setIsUnlinkModalOpen] = useState(false);
  const [unlinkPin, setUnlinkPin] = useState('');
  const [unlinkError, setUnlinkError] = useState('');

  const handlePairSuccess = useCallback((restoId: string) => {
    if (!restoId) return;
    const cleanId = String(restoId).trim();
    localStorage.setItem('pos_restaurant_id', cleanId);
    localStorage.setItem('admin_override_restaurant_id', cleanId);
    setTempRestoId(cleanId);
    setActiveRestoId(cleanId);
    setMissingIdError(false);
    setIsSettingsOpen(false);
    setAdminUnlockCount(0);
    toast.success("Écran KDS appairé avec succès !");
  }, []);

  const handleConfirmUnlink = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (unlinkPin === '1234') {
      localStorage.removeItem('pos_restaurant_id');
      localStorage.removeItem('admin_override_restaurant_id');
      setActiveRestoId('');
      setTempRestoId('');
      setMissingIdError(true);
      setOrders([]);
      setIsUnlinkModalOpen(false);
      setUnlinkPin('');
      setUnlinkError('');
      setIsSettingsOpen(false);
      setAdminUnlockCount(0);
      setPairingCode(generateRandomPairingCode());
      toast.success("Écran KDS dissocié avec succès");
    } else {
      setUnlinkError("Code PIN incorrect (requis : 1234)");
    }
  };

  const [forcedOrderIds, setForcedOrderIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState<number>(1);

  const [isPortrait, setIsPortrait] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerHeight > window.innerWidth;
    }
    return false;
  });

  const [landscapeLayoutMode, setLandscapeLayoutMode] = useState<'5x1' | '5x2'>(() => {
    return (localStorage.getItem('kds_layout_mode') as '5x1' | '5x2') || '5x1';
  });

  useEffect(() => {
    const handleResize = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const activeLayoutMode = isPortrait ? 'portrait' : landscapeLayoutMode;

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

  // CHOIX DU SON DES COMMANDES : 'chime' (Web Audio par défaut) ou 'mp3' (/son.mp3)
  const [soundType, setSoundType] = useState<'chime' | 'mp3'>(() => {
    return (localStorage.getItem('kds_sound_type') as 'chime' | 'mp3') || 'chime';
  });

  const [themeColors, setThemeColors] = useState({ primary: '#FBBF24', secondary: '#1e293b' });
  const [targetPrepMinutes, setTargetPrepMinutes] = useState<number>(15);

  const [productDict, setProductDict] = useState<Record<string, string>>({});
  const [productNameDict, setProductNameDict] = useState<Record<string, string>>({});
  const [productKdsDict, setProductKdsDict] = useState<Record<string, string>>({});

  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [dbHiddenCategories, setDbHiddenCategories] = useState<string[]>([]);

  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    JSON.parse(localStorage.getItem('kds_selected_categories') || '[]')
  );
  
  const [hiddenOptionNames, setHiddenOptionNames] = useState<string[]>([]);
  const [optionGroupSortDict, setOptionGroupSortDict] = useState<Record<string, number>>({});
  const [optionNameKdsDict, setOptionNameKdsDict] = useState<Record<string, string>>({});

  const [doneItems, setDoneItems] = useState<Record<string, boolean>>({});
  const [optionGroupMapping, setOptionGroupMapping] = useState<Record<string, string>>({});

  useEffect(() => {
    if (activeRestoId && adminUnlockCount < 5) return;

    const registerScreenPairing = async () => {
      try {
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        await supabase.from('screen_pairings').upsert(
          {
            pairing_code: pairingCode,
            device_name: 'KDS Cuisine',
            device_type: 'kds',
            status: 'PENDING',
            expires_at: expiresAt
          },
          { onConflict: 'pairing_code' }
        );
      } catch (err) {
        console.warn("screen_pairings upsert bypass:", err);
      }
    };

    registerScreenPairing();
  }, [pairingCode, activeRestoId, adminUnlockCount]);

  // Audio refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chimeLoopTimerRef = useRef<any>(null);
  const isLoopingSoundRef = useRef<boolean>(false);
  const mp3AudioRef = useRef<HTMLAudioElement | null>(null);

  // Pré-chargement du MP3 en toute sécurité
  useEffect(() => {
    try {
      const audio = new Audio('/son.mp3');
      audio.preload = 'auto';
      mp3AudioRef.current = audio;
    } catch (e) {
      console.warn("Impossible d'initialiser le fichier MP3:", e);
    }
  }, []);

  // Carillon Web Audio harmonique (D5 -> A5)
  const playScreenCallChime = useCallback(() => {
    try {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!audioCtxRef.current && AudioCtxClass) {
        audioCtxRef.current = new AudioCtxClass();
      }

      const ctx = audioCtxRef.current;
      if (!ctx) return;

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const nowTime = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(587.33, nowTime);
      gain1.gain.setValueAtTime(0.001, nowTime);
      gain1.gain.exponentialRampToValueAtTime(0.7, nowTime + 0.03);
      gain1.gain.exponentialRampToValueAtTime(0.0001, nowTime + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(nowTime);
      osc1.stop(nowTime + 0.35);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(880.0, nowTime + 0.14);
      gain2.gain.setValueAtTime(0.001, nowTime + 0.14);
      gain2.gain.exponentialRampToValueAtTime(0.8, nowTime + 0.17);
      gain2.gain.exponentialRampToValueAtTime(0.0001, nowTime + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(nowTime + 0.14);
      osc2.stop(nowTime + 0.55);
    } catch (e) {
      console.warn("Erreur lecture carillon KDS:", e);
    }
  }, []);

  // Lecture MP3 sécurisée
  const playMp3Sound = useCallback(() => {
    try {
      if (!mp3AudioRef.current) {
        mp3AudioRef.current = new Audio('/son.mp3');
      }
      mp3AudioRef.current.currentTime = 0;
      const playPromise = mp3AudioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn("Lecture du son MP3 bloquée ou indisponible :", err);
          playScreenCallChime();
        });
      }
    } catch (e) {
      console.warn("Erreur MP3 KDS :", e);
      playScreenCallChime();
    }
  }, [playScreenCallChime]);

  // Déclenchement selon le son choisi
  const playConfiguredAlertSound = useCallback(() => {
    if (soundType === 'mp3') {
      playMp3Sound();
    } else {
      playScreenCallChime();
    }
  }, [soundType, playMp3Sound, playScreenCallChime]);

  const startLoopingSound = useCallback(() => {
    if (!audioEnabled || isLoopingSoundRef.current) return;
    isLoopingSoundRef.current = true;
    playConfiguredAlertSound();

    if (chimeLoopTimerRef.current) clearInterval(chimeLoopTimerRef.current);
    chimeLoopTimerRef.current = setInterval(() => {
      playConfiguredAlertSound();
    }, 2500);
  }, [audioEnabled, playConfiguredAlertSound]);

  const stopLoopingSound = useCallback(() => {
    isLoopingSoundRef.current = false;
    if (chimeLoopTimerRef.current) {
      clearInterval(chimeLoopTimerRef.current);
      chimeLoopTimerRef.current = null;
    }
    if (mp3AudioRef.current) {
      mp3AudioRef.current.pause();
      mp3AudioRef.current.currentTime = 0;
    }
  }, []);

  const handleChangeSoundType = (type: 'chime' | 'mp3') => {
    setSoundType(type);
    localStorage.setItem('kds_sound_type', type);
    if (type === 'mp3') {
      playMp3Sound();
      toast.success("Sonnerie : Fichier audio MP3");
    } else {
      playScreenCallChime();
      toast.success("Sonnerie : Carillon KDS (Défaut)");
    }
  };

  useEffect(() => {
    let isMounted = true;
    const loadMapping = async () => {
      if (orders.length === 0 || !activeRestoId) return;
      const allItems = orders.flatMap(o => parseOrderDetails(o.order_details));
      const mapping = await fetchOptionGroupMapping(allItems, activeRestoId);
      if (isMounted) setOptionGroupMapping(mapping);
    };
    loadMapping();
    return () => { isMounted = false; };
  }, [orders, activeRestoId]);

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
      const activeIds = new Set(orders.filter(o => isActiveForKDS(o.status)).map(o => String(o.id)));
      let hasChanges = false;
      const next = { ...prev };
      
      Object.keys(next).forEach(key => {
        const orderId = key.split(':::')[0];
        if (!activeIds.has(orderId)) {
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
    if (activeRestoId && adminUnlockCount < 5) return;

    const pairChannel = supabase
      .channel(`kds_pair_${pairingCode}`)
      .on('broadcast', { event: 'pair_success' }, (payload) => {
        if (payload?.payload) {
          const rId = payload.payload.restaurant_id || payload.payload.restaurantId;
          if (rId) handlePairSuccess(rId);
        }
      })
      .subscribe();

    const tableChannel = supabase
      .channel(`kds_watch_screen_pairings_${pairingCode}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'screen_pairings',
          filter: `pairing_code=eq.${pairingCode}`
        },
        (payload) => {
          const row = payload.new || payload.old;
          if (row && row.status === 'PAIRED') {
            const rId = row.restaurant_id || row.restaurantId;
            if (rId) handlePairSuccess(rId);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(pairChannel);
      supabase.removeChannel(tableChannel);
    };
  }, [activeRestoId, adminUnlockCount, pairingCode, handlePairSuccess]);

  const unlockAudio = () => {
    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        if (!audioCtxRef.current) audioCtxRef.current = new AudioCtxClass();
        if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
      }
      playConfiguredAlertSound();
    } catch {}
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
      try {
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume();
        }
      } catch {}
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

  const handleChangeLayoutMode = (mode: '5x1' | '5x2') => {
    setLandscapeLayoutMode(mode);
    localStorage.setItem('kds_layout_mode', mode);
    setCurrentPage(1);
    toast.success(mode === '5x1' ? "Mode 5 Colonnes (1 Ligne) activé" : "Mode 10 Cases (2 Lignes) activé");
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

      const { data } = await supabase
        .from('product')
        .select('id, name, name_kds, category')
        .eq('restaurant_id', activeRestoId);

      if (data) {
        const dict: Record<string, string> = {};
        const nameDict: Record<string, string> = {};
        const kdsDict: Record<string, string> = {};
        const cats = new Set<string>();

        data.forEach(p => {
          const strId = p.id?.toString();
          const rawName = p.name ? p.name.trim() : '';
          const normName = rawName.toLowerCase();
          const normalizedClean = normalizeText(rawName);

          if (strId) dict[strId] = p.category;
          if (normName) nameDict[normName] = p.category;
          if (p.category) cats.add(p.category);

          if (p.name_kds && String(p.name_kds).trim()) {
            const cleanKds = String(p.name_kds).trim();
            if (strId) kdsDict[strId] = cleanKds;
            if (normName) kdsDict[normName] = cleanKds;
            if (normalizedClean) kdsDict[normalizedClean] = cleanKds;
          }
        });

        setProductDict(dict);
        setProductNameDict(nameDict);
        setProductKdsDict(kdsDict);
        setAvailableCategories(Array.from(cats).sort());
      }
    } catch (e) { console.error("Erreur chargement catalogue", e); }
  };

  const fetchKdsOptionsMetadata = async () => {
    if (!activeRestoId) return;
    try {
      const { data: groups } = await supabase
        .from('option_groups')
        .select('id, name, sort_kds, show_on_kds, product_overrides, target_category_name, target_subcategory_id')
        .eq('restaurant_id', activeRestoId);

      if (!groups) return;

      const namesToHide = new Set<string>();
      const groupIds: number[] = [];
      const sortDict: Record<string, number> = {};

      groups.forEach(g => {
        if (g.id) groupIds.push(g.id);

        if (g.name) {
          const normName = normalizeText(g.name);
          sortDict[normName] = typeof g.sort_kds === 'number' ? g.sort_kds : 0;
          if (g.show_on_kds === false) {
            namesToHide.add(g.name.toLowerCase().trim());
          }
        }
      });

      setOptionGroupSortDict(sortDict);

      const kdsNameDict: Record<string, string> = {};

      if (groupIds.length > 0) {
        const { data: links } = await supabase
          .from('option_group_links')
          .select('option_id')
          .in('group_id', groupIds);

        const optionIds = links ? links.map(l => l.option_id).filter(Boolean) : [];

        if (optionIds.length > 0) {
          const { data: options } = await supabase
            .from('options')
            .select('id, name, name_kds')
            .in('id', optionIds);

          if (options) {
            options.forEach(o => {
              if (o.name && o.name_kds && String(o.name_kds).trim()) {
                kdsNameDict[normalizeText(o.name)] = String(o.name_kds).trim();
              }
            });
          }
        }
      }

      try {
        const { data: directOpts } = await supabase
          .from('options')
          .select('name, name_kds')
          .eq('restaurant_id', activeRestoId);

        if (directOpts) {
          directOpts.forEach(o => {
            if (o.name && o.name_kds && String(o.name_kds).trim()) {
              kdsNameDict[normalizeText(o.name)] = String(o.name_kds).trim();
            }
          });
        }
      } catch {}

      setOptionNameKdsDict(kdsNameDict);
      setHiddenOptionNames(Array.from(namesToHide));
    } catch (e) { 
      console.error("Erreur lors de la récupération des métadonnées KDS", e); 
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
    } catch {
      toast.error("Erreur de connexion avec la base de données");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchCatalog();
    fetchKdsOptionsMetadata();
    fetchTheme();
    if (!activeRestoId) return;

    const ordersChannel = supabase
      .channel(`kds_orders_${activeRestoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${activeRestoId}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
           setOrders(prev => prev.filter(o => String(o.id) !== String(payload.old.id)));
           return;
        }
        fetchOrders();
      })
      .subscribe();

    const optionGroupsChannel = supabase
      .channel(`kds_optgroups_${activeRestoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'option_groups', filter: `restaurant_id=eq.${activeRestoId}` }, () => {
        fetchKdsOptionsMetadata();
      })
      .subscribe();

    const optionsChannel = supabase
      .channel(`kds_options_${activeRestoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'options' }, () => {
        fetchKdsOptionsMetadata();
      })
      .subscribe();

    const productsChannel = supabase
      .channel(`kds_products_${activeRestoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product', filter: `restaurant_id=eq.${activeRestoId}` }, () => {
        fetchCatalog();
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
      supabase.removeChannel(optionsChannel);
      supabase.removeChannel(productsChannel);
      supabase.removeChannel(categoriesChannel);
    };
  }, [activeRestoId, stopLoopingSound]);

  const acceptOrder = async (orderId: string | number) => {
    try {
      const { error } = await supabase.from('orders').update({ status: 'En cours' }).eq('id', orderId);
      if (error) throw error;
      setOrders(prev => prev.map(o => String(o.id) === String(orderId) ? { ...o, status: 'En cours' } : o));
      toast.success("Commande acceptée !");
    } catch { toast.error("Erreur lors de l'acceptation"); }
  };

  const markOrderAsReady = async (orderId: string | number) => {
    try {
      const { error } = await supabase.from('orders').update({ status: 'Prêt' }).eq('id', orderId);
      if (error) throw error;
      setOrders(prev => prev.map(o => String(o.id) === String(orderId) ? { ...o, status: 'Prêt' } : o));
      toast.success("Commande prête !");
    } catch { toast.error("Erreur lors de la validation"); }
  };

  const revertOrder = async (orderId: string | number) => {
    try {
      const { error } = await supabase.from('orders').update({ status: 'En cours' }).eq('id', orderId);
      if (error) throw error;
      toast.success("Commande replacée en cuisine !");
      setIsHistoryOpen(false); 
      fetchOrders();
    } catch { toast.error("Erreur lors de la restauration"); }
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
    const cleanId = tempRestoId.trim();
    localStorage.setItem('pos_restaurant_id', cleanId);
    localStorage.setItem('admin_override_restaurant_id', cleanId);
    setActiveRestoId(cleanId);
    fetchCatalog();
    fetchKdsOptionsMetadata();
    fetchTheme();
    fetchOrders();
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
      case ORDER_TYPE_IDS.SUR_PLACE: return <span className="text-[clamp(10px,1.15vh,15px)] font-black text-blue-600 bg-white px-[0.6vw] py-[0.2vh] uppercase tracking-widest rounded-none shadow-sm">SP</span>;
      case ORDER_TYPE_IDS.EMPORTER: return <span className="text-[clamp(10px,1.15vh,15px)] font-black text-orange-600 bg-white px-[0.6vw] py-[0.2vh] uppercase tracking-widest rounded-none shadow-sm">EMP</span>;
      case ORDER_TYPE_IDS.LIVRAISON: return <span className="text-[clamp(10px,1.15vh,15px)] font-black text-purple-600 bg-white px-[0.6vw] py-[0.2vh] uppercase tracking-widest rounded-none shadow-sm">LIV</span>;
      default: return <span className="text-[clamp(10px,1.15vh,15px)] font-black text-gray-600 bg-white px-[0.6vw] py-[0.2vh] uppercase tracking-widest rounded-none shadow-sm">?</span>;
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
        const rawProductName = item.product?.name || item.name || 'Produit inconnu';
        const productId = (item.product?.id || item.id || item.product_id || '').toString().trim();
        const baseProductId = productId.includes('-') ? productId.split('-')[0] : productId;
        const normRawName = rawProductName.toLowerCase().trim();
        const normalizedClean = normalizeText(rawProductName);

        const productName = 
          item.product?.name_kds ||
          item.name_kds ||
          productKdsDict[baseProductId] ||
          productKdsDict[productId] ||
          productKdsDict[normRawName] ||
          productKdsDict[normalizedClean] ||
          rawProductName;

        const qty = item.quantity || 1;
        
        const optionRows = extractOptionLinesForKDS(
          item, 
          hiddenOptionNames, 
          optionGroupMapping, 
          groupOptionsInline, 
          optionGroupSortDict, 
          optionNameKdsDict, 
          productKdsDict
        );

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
        const itemKey = `${order.id}:::${gItem.sig}`;
        
        flatLines.push({
          id: `${itemKey}:::prod`,
          isProduct: true,
          qty: gItem.qty,
          name: gItem.productName,
          sig: gItem.sig,
          itemKey,
          hasOptions: gItem.optionRows.length > 0
        });
        
        gItem.optionRows.forEach((row: any, rIdx: number) => {
          flatLines.push({
            id: `${itemKey}:::row-${rIdx}`,
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
      let linesPerColumn = 7;

      if (activeLayoutMode === '5x1') {
        rowSpan = 1;
        if (totalLines > 14) {
          colSpan = Math.min(5, Math.ceil(totalLines / 14));
          linesPerColumn = Math.ceil(totalLines / colSpan);
        } else {
          colSpan = 1;
          linesPerColumn = 14;
        }
      } else if (activeLayoutMode === '5x2') {
        if (totalLines <= 7) {
          rowSpan = 1;
          colSpan = 1;
          linesPerColumn = 7;
        } else if (totalLines <= 15) {
          rowSpan = 2;
          colSpan = 1;
          linesPerColumn = 15;
        } else {
          rowSpan = 2;
          colSpan = Math.min(5, Math.ceil(totalLines / 15));
          linesPerColumn = 15;
        }
      } else if (activeLayoutMode === 'portrait') {
        if (totalLines <= 8) {
          rowSpan = 1;
          colSpan = 1;
          linesPerColumn = 8;
        } else if (totalLines <= 16) {
          rowSpan = 2;
          colSpan = 1;
          linesPerColumn = 16;
        } else {
          rowSpan = 2;
          colSpan = 2;
          linesPerColumn = 14;
        }
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
  }, [
    orders, 
    selectedCategories, 
    productDict, 
    productNameDict, 
    productKdsDict, 
    hiddenOptionNames, 
    dbHiddenCategories, 
    availableCategories, 
    optionGroupMapping, 
    groupOptionsInline, 
    forcedOrderIds, 
    now, 
    activeLayoutMode, 
    optionGroupSortDict, 
    optionNameKdsDict
  ]);

  const newOrdersAlertList = useMemo(() => {
    return allDisplayOrders.filter(o => o.status?.trim().toLowerCase() === 'nouvelle');
  }, [allDisplayOrders]);

  const hasNewOrders = newOrdersAlertList.length > 0;

  useEffect(() => {
    if (hasNewOrders && audioEnabled) {
      startLoopingSound();
    } else {
      stopLoopingSound();
    }
    return () => stopLoopingSound();
  }, [hasNewOrders, audioEnabled, startLoopingSound, stopLoopingSound]);

  const paginatedPages = useMemo(() => {
    if (activeLayoutMode === '5x1') {
      return paginate5x1(allDisplayOrders);
    } else if (activeLayoutMode === '5x2') {
      return paginate5x2(allDisplayOrders);
    } else {
      return paginatePortrait(allDisplayOrders);
    }
  }, [allDisplayOrders, activeLayoutMode]);

  const totalPages = paginatedPages.length;
  const currentOrders = paginatedPages[currentPage - 1] || [];

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(Math.max(1, totalPages));
    }
  }, [totalPages, currentPage]);

  const goToPrevPage = useCallback(() => {
    setCurrentPage(p => Math.max(1, p - 1));
  }, []);

  const goToNextPage = useCallback(() => {
    setCurrentPage(p => Math.min(totalPages, p + 1));
  }, [totalPages]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = target && (
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.isContentEditable
      );

      if (!isInput && (e.key === 'd' || e.key === 'D')) {
        if (activeRestoId) {
          setIsUnlinkModalOpen(true);
          setUnlinkPin('');
          setUnlinkError('');
        }
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        goToPrevPage();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        goToNextPage();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrevPage, goToNextPage, activeRestoId]);

  const prevPageHasNew = useMemo(() => {
    if (currentPage <= 1) return false;
    const prevOrders = paginatedPages[currentPage - 2] || [];
    return prevOrders.some(o => o.status?.trim().toLowerCase() === 'nouvelle');
  }, [currentPage, paginatedPages]);

  const nextPageHasNew = useMemo(() => {
    if (currentPage >= totalPages) return false;
    const nextOrders = paginatedPages[currentPage] || [];
    return nextOrders.some(o => o.status?.trim().toLowerCase() === 'nouvelle');
  }, [currentPage, totalPages, paginatedPages]);

  const prevPageHasLate = useMemo(() => {
    if (currentPage <= 1) return false;
    const prevOrders = paginatedPages[currentPage - 2] || [];
    return prevOrders.some(o => ((now.getTime() - new Date(o.created_at).getTime()) / 60000) > targetPrepMinutes);
  }, [currentPage, paginatedPages, now, targetPrepMinutes]);

  const nextPageHasLate = useMemo(() => {
    if (currentPage >= totalPages) return false;
    const nextOrders = paginatedPages[currentPage] || [];
    return nextOrders.some(o => ((now.getTime() - new Date(o.created_at).getTime()) / 60000) > targetPrepMinutes);
  }, [currentPage, totalPages, paginatedPages, now, targetPrepMinutes]);

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

  const ADMIN_PROD_URL = import.meta.env.VITE_ADMIN_URL || 'https://project1-ft65s6zuh-yass13000s-projects.vercel.app';
  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocal = currentHostname === 'localhost' || currentHostname === '127.0.0.1' || currentHostname.startsWith('192.168.');
  const adminBaseUrl = isLocal 
    ? ADMIN_PROD_URL 
    : (typeof window !== 'undefined' ? window.location.origin : '');
  const mobilePairUrl = `${adminBaseUrl}/pair?code=${pairingCode}&type=kds`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(mobilePairUrl)}&margin=10`;

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

      {showAudioUnlock && !!activeRestoId && (
        <button 
          onClick={unlockAudio} 
          className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-[2vw] py-[1.2vh] rounded-none font-black animate-bounce shadow-2xl z-50 flex items-center gap-3 border-2 border-white cursor-pointer text-[clamp(13px,1.5vh,20px)]"
        >
          <VolumeX className="w-[2.2vh] h-[2.2vh]" /> CLIQUEZ ICI POUR ACTIVER LE SON
        </button>
      )}

      {isOffline && (
        <div className="absolute top-0 left-0 right-0 bg-red-600 text-white text-center py-[0.5vh] font-black uppercase tracking-widest text-[clamp(10px,1.2vh,16px)] flex justify-center items-center gap-1.5 z-50 animate-pulse">
          <WifiOff className="w-[1.8vh] h-[1.8vh]" /> Hors ligne ! KDS non synchronisé.
        </div>
      )}

      {/* NOTIFICATION FLOTTANTE NOUVELLES COMMANDES */}
      {newOrdersAlertList.length > 0 && (
        <div className={`absolute ${isOffline ? 'top-10' : 'top-4'} right-4 z-40 flex flex-col gap-2 max-w-sm pointer-events-auto`}>
          {newOrdersAlertList.map((newOrd) => (
            <div 
              key={newOrd.id} 
              className="bg-red-600/95 backdrop-blur-md border border-red-400/50 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center justify-between gap-4 animate-alert"
            >
              <div className="flex items-center gap-2.5">
                <BellRing size={20} className="text-white animate-bounce shrink-0" />
                <div>
                  <span className="text-[clamp(10px,1.1vh,13px)] uppercase font-black tracking-wider text-red-200 block leading-tight">
                    Nouvelle commande
                  </span>
                  <span className="font-black text-[clamp(16px,2vh,24px)] tracking-tight leading-none">
                    {newOrd.order_number || `#${String(newOrd.id).slice(-3)}`}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => acceptOrder(newOrd.id)}
                className="bg-white text-red-600 hover:bg-red-50 active:scale-95 px-3.5 py-1.5 rounded-lg font-black text-[clamp(11px,1.3vh,16px)] uppercase tracking-wider transition-all shadow-md cursor-pointer shrink-0"
              >
                Accepter
              </button>
            </div>
          ))}
        </div>
      )}

      {/* BOUTONS FLOTTANTS LATÉRAUX */}
      {totalPages > 1 && (
        <>
          {currentPage > 1 && (
            <button 
              type="button" 
              onClick={goToPrevPage} 
              className={`absolute left-2 top-1/2 -translate-y-1/2 z-30 w-9 h-9 2xl:w-12 2xl:h-12 rounded-full flex items-center justify-center backdrop-blur-md border text-white shadow-xl transition-all active:scale-90 cursor-pointer ${
                prevPageHasNew 
                  ? 'bg-red-600 text-white border-red-400 animate-pulse ring-2 ring-red-400' 
                  : 'bg-red-600/40 hover:bg-red-600/70 border-red-400/40'
              }`}
              title="Page précédente"
            >
              <ChevronLeft className="w-5 h-5 2xl:w-7 2xl:h-7" />
            </button>
          )}

          {currentPage < totalPages && (
            <button 
              type="button" 
              onClick={goToNextPage} 
              className={`absolute right-2 top-1/2 -translate-y-1/2 z-30 w-9 h-9 2xl:w-12 2xl:h-12 rounded-full flex items-center justify-center backdrop-blur-md border text-white shadow-xl transition-all active:scale-90 cursor-pointer ${
                nextPageHasNew 
                  ? 'bg-red-600 text-white border-red-400 animate-pulse ring-2 ring-red-400' 
                  : 'bg-red-600/40 hover:bg-red-600/70 border-red-400/40'
              }`}
              title="Page suivante"
            >
              <ChevronRight className="w-5 h-5 2xl:w-7 2xl:h-7" />
            </button>
          )}
        </>
      )}

      {!activeRestoId ? (
        <div className="h-screen w-screen max-h-screen max-w-screen overflow-hidden bg-black text-neutral-100 flex flex-col justify-between select-none font-sans tracking-tight">
          
          <header className="h-[9vh] min-h-[56px] px-8 lg:px-14 flex items-center justify-between border-b border-white/[0.06] shrink-0">
            <span className="text-xs lg:text-sm font-semibold tracking-[0.2em] uppercase text-neutral-400">
              Affichage Cuisine (KDS)
            </span>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-medium tracking-wider uppercase text-neutral-400">
                Prêt pour jumelage
              </span>
            </div>
          </header>

          <main className="flex-1 flex items-center justify-center p-6 lg:p-12 min-h-0">
            <div className={`w-full ${isPortrait ? 'max-w-xs' : 'max-w-3xl'}`}>
              {isPortrait ? (
                <div className="flex flex-col items-center text-center space-y-6">
                  <div className="p-3.5 bg-white rounded-2xl shadow-2xl">
                    <img src={qrImageUrl} alt="QR Code KDS" className="w-52 h-52 object-contain block" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] tracking-[0.25em] uppercase text-neutral-500 font-medium">
                      Code de validation
                    </span>
                    <div className="font-mono text-3xl font-light tracking-[0.3em] text-white">
                      {pairingCode.slice(0, 3)} {pairingCode.slice(3)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-neutral-500 pt-2">
                    <button
                      onClick={() => setPairingCode(generateRandomPairingCode())}
                      className="text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    >
                      Renouveler
                    </button>
                    <span>•</span>
                    <button
                      onClick={() => setIsSettingsOpen(true)}
                      className="text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    >
                      Configuration manuelle
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-12 lg:gap-16 items-center">
                  <div className="flex justify-end">
                    <div className="p-4 bg-white rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.8)]">
                      <img src={qrImageUrl} alt="QR Code KDS" className="w-48 h-48 lg:w-56 lg:h-56 object-contain block" />
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <h2 className="text-2xl lg:text-3xl font-light tracking-tight text-white">
                        Connexion du KDS
                      </h2>
                      <p className="text-xs lg:text-sm text-neutral-400 font-normal leading-relaxed max-w-sm">
                        Scannez ce QR code avec votre appareil photo ou saisissez le code ci-dessous sur votre interface de gestion.
                      </p>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-semibold tracking-[0.25em] uppercase text-neutral-500 block">
                        Code d'association
                      </span>
                      <div className="font-mono text-4xl lg:text-5xl font-light tracking-[0.2em] text-white leading-none">
                        {pairingCode.slice(0, 3)} {pairingCode.slice(3)}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-neutral-500 pt-2 border-t border-white/[0.06]">
                      <button
                        onClick={() => setPairingCode(generateRandomPairingCode())}
                        className="text-neutral-400 hover:text-white transition-colors cursor-pointer"
                      >
                        Générer un nouveau code
                      </button>
                      <span>•</span>
                      <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="text-neutral-400 hover:text-white transition-colors cursor-pointer"
                      >
                        Configuration manuelle
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>

          <footer className="h-[6vh] min-h-[44px] px-8 lg:px-14 flex items-center justify-between border-t border-white/[0.06] text-[11px] text-neutral-500 tracking-wider uppercase shrink-0">
            <span>Protocole sécurisé</span>
            <span className="font-mono text-neutral-600">
              ID: {deviceId}
            </span>
          </footer>
        </div>
      ) : (
        <div className={`flex-1 w-full overflow-hidden bg-slate-950 ${isOffline ? 'pt-[3vh]' : ''}`}>
          <div 
            className="grid w-full h-full gap-0"
            style={{
              gridTemplateColumns: activeLayoutMode === 'portrait' 
                ? 'repeat(2, minmax(0, 1fr))' 
                : 'repeat(5, minmax(0, 1fr))',
              gridTemplateRows: activeLayoutMode === '5x1' 
                ? '1fr' 
                : activeLayoutMode === '5x2' 
                  ? 'repeat(2, minmax(0, 1fr))' 
                  : 'repeat(3, minmax(0, 1fr))'
            }}
          >
            {currentOrders.map((order) => {
              const status = order.status?.trim().toLowerCase() || '';
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
                ? 'border-[3px] border-red-500 animate-alert z-20' 
                : 'border border-slate-900 z-10';

              return (
                <div 
                  key={order.id} 
                  style={{
                    gridColumn: `${order.gridColStart} / span ${order.colSpan}`,
                    gridRow: `${order.gridRowStart} / span ${order.rowSpan}`
                  }}
                  className={`bg-slate-100 flex flex-col overflow-hidden rounded-none h-full ${cardBorderClass}`}
                >
                  <div className={`${headerBgClass} px-[0.8vw] py-[0.8vh] flex justify-between items-center border-b border-black/30 flex-shrink-0 z-10`}>
                    <div className="flex items-center gap-[0.5vw]">
                      {isNewOrder && <BellRing className="w-[1.8vh] h-[1.8vh] text-white animate-bounce" />}
                      {getOrderTypeBadge(order.order_type_id)}
                    </div>
                    <OrderTimer 
                      createdAt={order.created_at} 
                      now={now} 
                      scheduledTime={order.scheduled_time} 
                      targetPrepMinutes={targetPrepMinutes}
                    />
                    <div className="text-[clamp(13px,1.8vh,24px)] font-black text-slate-900 bg-white px-[0.8vw] py-[0.2vh] rounded-none shadow-sm">
                      {order.order_number || `#${order.id.toString().slice(-3)}`}
                    </div>
                  </div>

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

                            if (line.isProduct) {
                              return (
                                <div 
                                  key={line.id}
                                  onClick={() => toggleItemDone(line.id)}
                                  className={`min-h-0 w-full overflow-hidden flex items-center px-[0.8vw] py-[0.4vh] cursor-pointer transition-colors border-x border-slate-300 rounded-none ${isChunkFirst ? 'border-t' : ''} ${(!line.hasOptions || isChunkLast) ? 'border-b border-slate-400 shadow-sm' : 'border-b border-slate-200'} ${isDone ? 'bg-emerald-500' : 'bg-white'}`}
                                >
                                  <span className={`px-[0.5vw] py-[0.3vh] rounded-none ${currentProductFont.qtyClass} font-black mr-[0.6vw] flex-shrink-0 leading-none ${isDone ? 'bg-emerald-700 text-white' : 'bg-slate-900 text-white'}`}>
                                    {line.qty}x
                                  </span>
                                  <span className={`${currentProductFont.textClass} font-black uppercase leading-tight truncate ${isDone ? 'text-emerald-950' : 'text-slate-950'}`}>
                                    {line.name}
                                  </span>
                                </div>
                              );
                            } else {
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
                              let optPaddingClass = "px-[0.6vw]";

                              if (itemsList.length === 2) {
                                optFontSizeClass = currentOptionFont.double;
                                optPaddingClass = "px-[0.4vw]";
                              } else if (itemsList.length >= 3) {
                                optFontSizeClass = currentOptionFont.triple;
                                optPaddingClass = "px-[0.3vw]";
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
                                      className={`flex-1 min-w-0 flex items-center justify-start ${optPaddingClass} py-[0.3vh] h-full gap-1 ${optIdx < itemsList.length - 1 ? dividerClass : ''}`}
                                    >
                                      <span className={`text-[clamp(11px,1.2vh,16px)] font-black flex-shrink-0 leading-none ${iconColor}`}>
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

                  <div className="flex-shrink-0 border-t border-slate-900 z-10">
                    {isNewOrder ? (
                      <button onClick={() => acceptOrder(order.id)} className="w-full bg-red-600 hover:bg-red-700 active:scale-[0.99] text-white font-black text-[clamp(12px,1.6vh,22px)] uppercase tracking-widest py-[1.2vh] transition-all flex justify-center items-center gap-2 rounded-none cursor-pointer">
                        <BellRing className="w-[1.8vh] h-[1.8vh]" /> Accepter
                      </button>
                    ) : (
                      <button onClick={() => markOrderAsReady(order.id)} className="w-full bg-emerald-500 hover:bg-emerald-600 active:scale-[0.99] text-slate-900 font-black text-[clamp(12px,1.6vh,22px)] uppercase tracking-widest py-[1.2vh] transition-all flex justify-center items-center gap-2 rounded-none cursor-pointer">
                        <CheckCircle2 className="w-[1.8vh] h-[1.8vh]" strokeWidth={3} /> Prêt
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* BARRE DE CONTRÔLE DÉPLACÉE EN BAS */}
      <footer className="h-[6vh] min-h-[48px] px-4 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 flex items-center justify-between z-20 flex-shrink-0">
        
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="text-[clamp(12px,1.4vh,18px)] font-black tracking-widest uppercase text-slate-400">
            {selectedCategories.length > 0 || dbHiddenCategories.length > 0 ? "KDS (FILTRÉ)" : "KDS CUISINE"}
          </span>
          {!!activeRestoId && (
            <span className="text-[clamp(11px,1.3vh,16px)] font-black bg-slate-800 text-amber-400 px-3 py-0.5 rounded-full border border-slate-700">
              {allDisplayOrders.length}
            </span>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1.5 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800/80 shadow-inner">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={goToPrevPage}
              className={`h-[4.2vh] w-[4.2vh] min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg transition-all active:scale-90 cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed ${
                prevPageHasNew 
                  ? 'bg-red-600 text-white animate-pulse ring-2 ring-red-400' 
                  : prevPageHasLate 
                    ? 'text-amber-400 hover:text-white hover:bg-slate-800' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Page précédente"
            >
              {prevPageHasNew ? (
                <BellRing size={18} className="text-white animate-bounce" />
              ) : (
                <ChevronLeft size={20} />
              )}
            </button>

            <div className="flex items-center gap-1.5 px-1.5">
              {paginatedPages.map((pageOrders, idx) => {
                const pageNum = idx + 1;
                const isActive = pageNum === currentPage;
                const pageHasNew = pageOrders.some(o => o.status?.trim().toLowerCase() === 'nouvelle');

                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    className={`h-[3.8vh] min-h-[32px] px-3 rounded-lg text-[clamp(11px,1.3vh,16px)] font-black transition-all cursor-pointer ${
                      isActive
                        ? 'bg-amber-500 text-slate-950 shadow-md font-black scale-105'
                        : pageHasNew
                          ? 'bg-red-600 text-white animate-pulse'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={goToNextPage}
              className={`h-[4.2vh] w-[4.2vh] min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg transition-all active:scale-90 cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed ${
                nextPageHasNew 
                  ? 'bg-red-600 text-white animate-pulse ring-2 ring-red-400' 
                  : nextPageHasLate 
                    ? 'text-amber-400 hover:text-white hover:bg-slate-800' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Page suivante"
            >
              {nextPageHasNew ? (
                <BellRing size={18} className="text-white animate-bounce" />
              ) : (
                <ChevronRight size={20} />
              )}
            </button>
          </div>
        )}

        <div className="flex items-center gap-2.5 shrink-0">
          <button 
            type="button"
            onClick={() => setIsScheduledModalOpen(true)}
            className={`h-[4.4vh] min-h-[40px] px-3.5 rounded-xl font-black text-[clamp(11px,1.35vh,16px)] flex items-center gap-2 transition-all cursor-pointer border ${
              futureScheduledCount > 0 
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/60 shadow-md' 
                : 'bg-slate-800/50 text-slate-300 hover:text-white hover:bg-slate-800 border-slate-700/60'
            }`}
            title="Commandes programmées"
          >
            <CalendarClock className="w-[2.2vh] h-[2.2vh] min-w-[20px] min-h-[20px]" />
            {futureScheduledCount > 0 && (
              <span className="font-black text-[clamp(10px,1.2vh,14px)] bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full">
                {futureScheduledCount}
              </span>
            )}
          </button>

          <button 
            type="button"
            onClick={() => setIsHistoryOpen(true)} 
            className="h-[4.4vh] w-[4.4vh] min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-slate-800/50 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700/60 transition-colors relative cursor-pointer"
            title="Historique"
          >
            <History className="w-[2.3vh] h-[2.3vh] min-w-[22px] min-h-[22px]" />
            {historyOrders.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-slate-900" />
            )}
          </button>

          <button 
            type="button"
            onClick={toggleAudioStatus} 
            className={`h-[4.4vh] w-[4.4vh] min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl transition-colors cursor-pointer border ${
              audioEnabled 
                ? 'bg-slate-800/50 text-slate-300 hover:text-white hover:bg-slate-800 border-slate-700/60' 
                : 'bg-red-500/20 text-red-400 border-red-500/50 animate-pulse'
            }`} 
            title="Son"
          >
            {audioEnabled ? (
              <Volume2 className="w-[2.3vh] h-[2.3vh] min-w-[22px] min-h-[22px]" />
            ) : (
              <VolumeX className="w-[2.3vh] h-[2.3vh] min-w-[22px] min-h-[22px]" />
            )}
          </button>

          <button 
            type="button"
            onClick={() => { fetchOrders(); fetchCatalog(); fetchKdsOptionsMetadata(); }} 
            className="h-[4.4vh] w-[4.4vh] min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-slate-800/50 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700/60 transition-colors cursor-pointer"
            title="Actualiser"
          >
            <RefreshCcw className={`w-[2.2vh] h-[2.2vh] min-w-[20px] min-h-[20px] ${isLoading ? "animate-spin text-amber-400" : ""}`} />
          </button>

          <button 
            type="button"
            onClick={() => setIsSettingsOpen(true)} 
            className="h-[4.4vh] w-[4.4vh] min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-slate-800/50 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700/60 transition-colors cursor-pointer"
            title="Paramètres"
          >
            <Settings className="w-[2.2vh] h-[2.2vh] min-w-[20px] min-h-[20px]" />
          </button>

          <div className="w-px h-6 bg-slate-700 mx-1"></div>

          <HeaderClock />
        </div>
      </footer>

      {/* MODAL COMMANDES PROGRAMMÉES */}
      <ScheduledOrdersModal
        isOpen={isScheduledModalOpen}
        onClose={() => setIsScheduledModalOpen(false)}
        orders={orders.filter(o => isActiveForKDS(o.status))}
        onForceSendToKitchen={handleForceSendToKitchen}
        themeColors={themeColors}
      />

      {/* MODAL HISTORIQUE */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-secondary p-6 w-full max-w-3xl border border-white/10 flex flex-col max-h-[85vh] rounded-none">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black uppercase text-white flex items-center gap-3"><History size={24}/> Historique</h2>
              <button onClick={() => setIsHistoryOpen(false)} className="text-white/50 hover:text-white"><X size={24} /></button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
              {historyOrders.length === 0 ? (
                <div className="text-center py-8 text-white/40 text-sm">Aucune commande récente</div>
              ) : (
                historyOrders.map(order => {
                  const isClosed = order.status?.toLowerCase() === 'fermé' || order.status?.toLowerCase() === 'ferme' || order.status?.toLowerCase() === 'annulée';
                  const items = parseOrderDetails(order.order_details);

                  return (
                    <div key={order.id} className="bg-white/5 border border-white/10 p-4 flex justify-between items-center rounded-none">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <span className="font-black text-lg text-white">{order.order_number || `#${order.id.toString().slice(-3)}`}</span>
                          <span className={`px-2.5 py-0.5 text-xs font-black uppercase rounded-none ${isClosed ? 'bg-white/10 text-white/50' : 'bg-emerald-500/20 text-emerald-400'}`}>{order.status}</span>
                        </div>
                        <div className="text-sm text-white/60">
                          {items.filter(Boolean).map((i: any) => {
                            const rawName = i.product?.name || i.name || 'Article';
                            const pId = (i.product?.id || i.id || i.product_id || '').toString().trim();
                            const basePId = pId.includes('-') ? pId.split('-')[0] : pId;
                            const displayName = i.product?.name_kds || i.name_kds || productKdsDict[basePId] || productKdsDict[pId] || productKdsDict[rawName.toLowerCase().trim()] || rawName;
                            return `${i.quantity || 1}x ${displayName}`;
                          }).join(' • ')}
                        </div>
                      </div>
                      
                      <button onClick={() => revertOrder(order.id)} className="bg-white/10 hover:bg-amber-500 hover:text-slate-900 text-white font-black px-4 py-2 text-xs uppercase rounded-none transition-colors flex items-center gap-2">
                        <RotateCcw size={16} /> Restaurer
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARAMÈTRES */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
          <div className="bg-secondary w-full max-w-3xl border border-white/10 flex flex-col rounded-none">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-secondary">
              <h2 
                className="text-xl font-black uppercase text-white flex items-center gap-3 cursor-pointer select-none" 
                onClick={() => {
                  setAdminUnlockCount(prev => {
                    const next = prev + 1;
                    if (next === 5) toast.info("Mode Administrateur déverrouillé");
                    return next;
                  });
                }}
              >
                <Settings size={24}/> Paramètres KDS
              </h2>
              <button onClick={() => { setIsSettingsOpen(false); setAdminUnlockCount(0); }} className="text-white/50 hover:text-white p-1"><X size={24} /></button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh] custom-scrollbar">
              
              {/* SECTION ADMIN MASQUÉE */}
              {adminUnlockCount >= 5 && (
                <div className="border border-white/15 bg-black/60 p-5 rounded-2xl space-y-5">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-300 flex items-center gap-2">
                      <QrCode size={16} className="text-emerald-400" /> Administration & Appairage
                    </span>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-bold px-2 py-0.5 rounded-full border border-emerald-500/20">
                      Déverrouillé
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center bg-black/80 p-4 rounded-xl border border-white/10">
                    <div className="flex flex-col items-center">
                      <div className="bg-white p-3 rounded-xl shadow-lg">
                        <img src={qrImageUrl} alt="QR Code KDS" className="w-36 h-36 object-contain block" />
                      </div>
                      <span className="text-[10px] text-neutral-400 uppercase font-semibold mt-2 tracking-wider">
                        Scanner avec la PWA
                      </span>
                    </div>

                    <div className="flex flex-col items-center text-center gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-neutral-400">
                        Code d'association
                      </span>
                      <div className="font-mono font-light text-3xl tracking-[0.2em] text-white">
                        {pairingCode.slice(0, 3)} {pairingCode.slice(3)}
                      </div>
                      <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1.5 pt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Prêt pour jumelage
                      </span>
                    </div>
                  </div>

                  <div className="pt-1">
                    <label className="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1.5">
                      Identifiant Restaurant (UUID)
                    </label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={tempRestoId} 
                        onChange={(e) => setTempRestoId(e.target.value)} 
                        placeholder="UUID du restaurant..."
                        className="flex-1 bg-black/60 border border-white/20 px-3 py-2 text-white text-xs rounded-xl focus:outline-none focus:border-white/40" 
                      />
                      <button 
                        type="button"
                        onClick={handleSaveSettings} 
                        className="bg-white hover:bg-neutral-200 text-black font-semibold uppercase px-4 py-2 text-xs rounded-xl transition-colors cursor-pointer"
                      >
                        Sauver
                      </button>
                    </div>
                  </div>

                  {activeRestoId && (
                    <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                      <span className="text-xs text-neutral-400">
                        Déconnecter cet écran de l'établissement actuel :
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsUnlinkModalOpen(true);
                          setUnlinkPin('');
                          setUnlinkError('');
                        }}
                        className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold uppercase px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Unlink size={14} /> Dissocier (PIN)
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION NOUVELLE : CHOIX DE LA SONNERIE */}
              <div className="border-t border-white/10 pt-4">
                <h3 className="text-sm font-black uppercase text-white mb-3 flex items-center gap-2">
                  <BellRing size={18} className="text-amber-500"/> Sonnerie des commandes
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleChangeSoundType('chime')}
                    className={`p-3.5 text-left border rounded-none transition-all flex flex-col justify-between cursor-pointer ${
                      soundType === 'chime'
                        ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-lg'
                        : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-black text-sm uppercase">Carillon KDS (Défaut)</span>
                      <Volume2 size={18} />
                    </div>
                    <p className={`text-xs ${soundType === 'chime' ? 'text-slate-900 font-semibold' : 'text-white/50'}`}>
                      Harmonique synthétique (Web Audio API). Zéro latence réseau et fonctionne hors ligne.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleChangeSoundType('mp3')}
                    className={`p-3.5 text-left border rounded-none transition-all flex flex-col justify-between cursor-pointer ${
                      soundType === 'mp3'
                        ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-lg'
                        : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-black text-sm uppercase">Fichier MP3 (son.mp3)</span>
                      <BellRing size={18} />
                    </div>
                    <p className={`text-xs ${soundType === 'mp3' ? 'text-slate-900 font-semibold' : 'text-white/50'}`}>
                      Sonnerie personnalisée servie depuis le dossier public (/son.mp3).
                    </p>
                  </button>
                </div>
              </div>

              {/* DISPOSITION DE LA GRILLE */}
              <div className="border-t border-white/10 pt-4">
                <h3 className="text-sm font-black uppercase text-white mb-3 flex items-center gap-2">
                  <LayoutGrid size={18} className="text-amber-500"/> Disposition de la grille KDS
                </h3>

                {isPortrait ? (
                  <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-none flex items-center gap-3 text-amber-300">
                    <Smartphone size={24} className="shrink-0" />
                    <div>
                      <div className="text-sm font-black uppercase">Mode Portrait Actif (Automatique)</div>
                      <div className="text-xs text-white/70">
                        L'écran est détecté en position verticale. La grille est automatiquement verrouillée en 2 colonnes x 3 rangées adaptées aux bornes et totems.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleChangeLayoutMode('5x1')}
                      className={`p-3.5 text-left border rounded-none transition-all flex flex-col justify-between ${
                        landscapeLayoutMode === '5x1'
                          ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-lg'
                          : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-black text-sm uppercase">1 Ligne (5 Colonnes)</span>
                        <Monitor size={18} />
                      </div>
                      <p className={`text-xs ${landscapeLayoutMode === '5x1' ? 'text-slate-900 font-semibold' : 'text-white/50'}`}>
                        Pleine hauteur sans saut vertical. Parfait pour les commandes burger, menus complets et longs tickets.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleChangeLayoutMode('5x2')}
                      className={`p-3.5 text-left border rounded-none transition-all flex flex-col justify-between ${
                        landscapeLayoutMode === '5x2'
                          ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-lg'
                          : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-black text-sm uppercase">2 Lignes (10 Cases)</span>
                        <LayoutGrid size={18} />
                      </div>
                      <p className={`text-xs ${landscapeLayoutMode === '5x2' ? 'text-slate-900 font-semibold' : 'text-white/50'}`}>
                        Grille dense 5x2 avec anti-trou intelligent. Idéal pour voir un maximum de commandes rapides d'un coup.
                      </p>
                    </button>
                  </div>
                )}
              </div>

              {/* POLICE PRODUITS */}
              <div className="border-t border-white/10 pt-4">
                <h3 className="text-sm font-black uppercase text-white mb-3 flex items-center gap-2">
                  <Type size={18} className="text-amber-500"/> Taille police des produits
                </h3>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(PRODUCT_FONT_CONFIGS).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => handleChangeProductFontSize(key)}
                      className={`py-2 px-2 font-black text-xs uppercase rounded-none transition-colors border ${
                        productFontSize === key
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* POLICE OPTIONS */}
              <div className="border-t border-white/10 pt-4">
                <h3 className="text-sm font-black uppercase text-white mb-3 flex items-center gap-2">
                  <Type size={18} className="text-cyan-400"/> Taille police des options
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(OPTION_FONT_CONFIGS).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => handleChangeOptionFontSize(key)}
                      className={`py-2 px-2 font-black text-xs uppercase rounded-none transition-colors border ${
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

              {/* DISPOSITION GROUPÉE DES OPTIONS */}
              <div className="border-t border-white/10 pt-4">
                <h3 className="text-sm font-black uppercase text-white mb-2 flex items-center gap-2">
                  <LayoutGrid size={18} className="text-amber-500"/> Disposition des options
                </h3>
                <div className="flex items-center justify-between bg-white/5 p-4 border border-white/10 rounded-none">
                  <div className="pr-4">
                    <div className="text-sm font-bold text-white uppercase">
                      Grouper les options d'un même groupe
                    </div>
                    <div className="text-xs text-white/50 mt-1">
                      {groupOptionsInline 
                        ? "Activé : Les options d'un même groupe s'affichent côte à côte avec police auto-adaptée." 
                        : "Désactivé : Chaque option occupe sa propre ligne pleine largeur (lisibilité maximale)."}
                    </div>
                  </div>
                  <button
                    onClick={toggleGroupOptionsInline}
                    className={`px-4 py-2 font-black text-xs uppercase rounded-none transition-colors shrink-0 ${
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
              <div className="border-t border-white/10 pt-4">
                <div className="flex justify-between items-end mb-3">
                  <h3 className="text-sm font-black uppercase text-white flex items-center gap-2"><Filter size={18} className="text-amber-500"/> Filtres par catégorie</h3>
                  {selectedCategories.length > 0 && <button onClick={() => { setSelectedCategories([]); localStorage.removeItem('kds_selected_categories'); }} className="text-xs text-red-400 font-bold uppercase">Tout afficher</button>}
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {availableCategories.map(cat => (
                    <button key={cat} onClick={() => toggleCategory(cat)} className={`px-3 py-1.5 text-xs font-black uppercase border rounded-none transition-colors ${selectedCategories.map(c => c.toLowerCase().trim()).includes(cat.toLowerCase().trim()) ? 'bg-amber-500 text-slate-900 border-amber-500' : 'bg-transparent text-white/70 border-white/20'}`}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* MODAL DISSOCIATION (PIN 1234) */}
      {isUnlinkModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/20 p-6 md:p-8 w-full max-w-md shadow-2xl rounded-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4 text-white">
              <KeyRound className="w-6 h-6" />
            </div>

            <h2 className="text-xl font-bold uppercase tracking-wider text-white mb-2">
              Dissocier l'écran KDS
            </h2>
            <p className="text-xs text-neutral-400 mb-6 leading-relaxed">
              Veuillez saisir le code PIN de sécurité (1234) pour déconnecter cet écran et revenir à l'état initial d'appairage.
            </p>

            <form onSubmit={handleConfirmUnlink} className="space-y-4">
              <div>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  autoFocus
                  placeholder="Code PIN"
                  value={unlinkPin}
                  onChange={(e) => {
                    setUnlinkPin(e.target.value);
                    if (unlinkError) setUnlinkError('');
                  }}
                  className="w-full bg-black border border-white/20 focus:border-white/60 text-white text-center text-2xl tracking-widest py-3 px-4 rounded-xl focus:outline-none font-mono"
                />
                {unlinkError && (
                  <p className="text-xs text-rose-400 font-semibold mt-2">
                    {unlinkError}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsUnlinkModalOpen(false);
                    setUnlinkPin('');
                    setUnlinkError('');
                  }}
                  className="bg-white/10 hover:bg-white/15 text-white font-medium text-xs uppercase py-3 rounded-xl transition-colors cursor-pointer"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  className="bg-white hover:bg-neutral-200 text-black font-semibold text-xs uppercase py-3 rounded-xl transition-colors cursor-pointer shadow-md"
                >
                  Confirmer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default KDS;