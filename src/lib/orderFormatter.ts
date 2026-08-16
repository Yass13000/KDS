// @ts-nocheck
import { supabase } from '@/lib/supabaseClient';

export interface FormattedOptionItem {
  name: string;
  price: number;
  qty: number;
  isSans: boolean;
}

export interface FormattedOptionGroup {
  groupName: string;
  originalGroupName?: string;
  items: FormattedOptionItem[];
}

const safeParseJSON = (data: unknown): Record<string, unknown> => {
  if (typeof data === 'object' && data !== null) return data as Record<string, unknown>;
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
  return {};
};

const safeParseFloat = (val: unknown): number => {
  const num = parseFloat(String(val ?? 0));
  return isNaN(num) ? 0 : num;
};

// 🟢 Heuristique intelligente de secours pour garantir le bon groupe en toute circonstance
const detectCategoryHeuristic = (name: string): string | null => {
  if (!name) return null;
  const upper = name.toUpperCase();

  if (/SAVEUR|SPICY|HOT|LEMON|PEPPER|BBQ\s*DIP|SWEET|HONEY|BUFFALO|GARLIC/i.test(upper) && !/PEPSI|COCA|BOISSON/i.test(upper)) {
    return 'SAVEURS';
  }
  if (/SAUCE|MAYO|KETCHUP|RANCH|ALGERIENNE|SAMOURAI|BIGGY|ANDALOUSE|POIVRE|CURRY|CHEDDAR\s*DIP/i.test(upper)) {
    return 'SAUCES';
  }
  if (/PEPSI|COCA|FANTA|SPRITE|OASIS|ICE\s*TEA|EAU|RED\s*BULL|7UP|TROPICO|SCHWEPPES|CAPRI|50CL|33CL|BOISSON/i.test(upper)) {
    return 'BOISSONS';
  }
  if (/FRITE|POTATOES|MAÏS|MAIS|ONION\s*RING|MOZZA|NUGGET|TENDER|WINGS|ACCOMPAGNEMENT/i.test(upper)) {
    return 'ACCOMPAGNEMENTS';
  }
  if (/SLIDER|BURGER|SANDWICH/i.test(upper)) {
    return 'CHOIX PRINCIPAL';
  }
  if (/TAILLE|FORMAT|SIMPLE|DOUBLE|TRIPLE|MENU|XL|L\b|M\b/i.test(upper)) {
    return 'TAILLE';
  }
  if (/DONUT|COOKIE|MUFFIN|TIRAMISU|GLACE|BROWNIE|SUNDAE|DESSERT/i.test(upper)) {
    return 'DESSERTS';
  }
  if (/SUPP|SUPPLÉMENT|EXTRA/i.test(upper)) {
    return 'SUPPLÉMENTS';
  }

  return null;
};

/**
 * 🟢 1. MAPPING ROBUSTE DES OPTIONS DEPUIS SUPABASE (GROUPS, OPTIONS & PRODUITS BORNE/CAISSE)
 */
export const fetchOptionGroupMapping = async (
  items: any[], 
  activeRestoId?: string
): Promise<Record<string, string>> => {
  if (!items || items.length === 0) return {};

  const allCandidateIds = new Set<string>();
  const explicitGroupIds = new Set<string>();

  const collectIds = (arr: any) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((o: any) => {
      if (!o) return;
      if (o.options && Array.isArray(o.options)) {
        if (o.groupId !== undefined && o.groupId !== null && String(o.groupId).trim() !== '') {
          explicitGroupIds.add(String(o.groupId));
        }
        if (o.option_group_id) explicitGroupIds.add(String(o.option_group_id));
        if (o.group_id) explicitGroupIds.add(String(o.group_id));
        collectIds(o.options);
      } else {
        if (o.option_group_id) explicitGroupIds.add(String(o.option_group_id));
        if (o.group_id) explicitGroupIds.add(String(o.group_id));
        if (o.groupId !== undefined && o.groupId !== null && String(o.groupId).trim() !== '') {
          explicitGroupIds.add(String(o.groupId));
        }

        if (o.id) {
          const strId = String(o.id).replace('dyn_', '');
          if (strId) allCandidateIds.add(strId);
        }
        if (o.original_product_id) {
          allCandidateIds.add(String(o.original_product_id));
        }
      }
    });
  };

  items.forEach(item => {
    if (!item) return;
    collectIds(item.selectedSubOptions);
    collectIds(item.options);
    collectIds(item.flatOptions);
    collectIds(item.directSubOptions);
    collectIds(item.boissonSubChoices);
    collectIds(item.accompagnementSubChoices);

    if (item.boisson && typeof item.boisson === 'object' && item.boisson.id) {
      allCandidateIds.add(String(item.boisson.id));
    }
    if (item.accompagnement && typeof item.accompagnement === 'object' && item.accompagnement.id) {
      allCandidateIds.add(String(item.accompagnement.id));
    }

    if (typeof item.selections === 'object' && item.selections !== null) {
      Object.entries(item.selections).forEach(([grpKey, val]) => {
        if (grpKey && !isNaN(Number(grpKey))) explicitGroupIds.add(String(grpKey));
        if (Array.isArray(val)) collectIds(val);
      });
    }
  });

  const mapping: Record<string, string> = {};

  try {
    // A. Récupération par ID de groupe explicite
    const cleanGroupIds = Array.from(explicitGroupIds).filter(id => id && !isNaN(Number(id)) && Number(id) > 0);
    if (cleanGroupIds.length > 0) {
      const { data: groupData } = await supabase
        .from('option_groups')
        .select('id, name')
        .in('id', cleanGroupIds);

      if (groupData) {
        groupData.forEach((grp: any) => {
          mapping[`grp_${grp.id}`] = grp.name;
          mapping[String(grp.id)] = grp.name;
        });
      }
    }

    const cleanIds = Array.from(allCandidateIds).filter(id => id && !isNaN(Number(id)));

    // B. Récupération des options standards (table option_group_links)
    if (cleanIds.length > 0) {
      const { data: linksData } = await supabase
        .from('option_group_links')
        .select('option_id, group_id')
        .in('option_id', cleanIds);

      if (linksData && linksData.length > 0) {
        const groupIds = Array.from(new Set(linksData.map(l => l.group_id).filter(Boolean)));
        if (groupIds.length > 0) {
          const { data: groupsData } = await supabase
            .from('option_groups')
            .select('id, name')
            .in('id', groupIds);

          if (groupsData) {
            const groupNameMap: Record<string | number, string> = {};
            groupsData.forEach(g => {
              if (g.id && g.name) groupNameMap[g.id] = g.name;
            });

            linksData.forEach(link => {
              if (link.option_id && link.group_id && groupNameMap[link.group_id]) {
                const strOptId = String(link.option_id);
                mapping[strOptId] = groupNameMap[link.group_id];
                mapping[`dyn_${strOptId}`] = groupNameMap[link.group_id];
              }
            });
          }
        }
      }

      // C. Récupération des produits utilisés comme options (Borne : Boissons, Accompagnements, Sauces...)
      const { data: productsData } = await supabase
        .from('product')
        .select('id, name, category, subcategory_id')
        .in('id', cleanIds);

      const prodInfoMap: Record<string, any> = {};
      if (productsData) {
        productsData.forEach(p => {
          if (p.id) {
            prodInfoMap[String(p.id)] = {
              name: p.name,
              category: p.category ? String(p.category).trim().toUpperCase() : '',
              subcategory_id: p.subcategory_id
            };
          }
        });
      }

      // Récupération de tous les groupes d'options actifs du restaurant
      let dynQuery = supabase
        .from('option_groups')
        .select('id, name, product_overrides, target_category_name, target_subcategory_id');

      if (activeRestoId) {
        dynQuery = dynQuery.or(`restaurant_id.eq.${activeRestoId},restaurant_id.is.null`);
      }

      const { data: allGroups } = await dynQuery;

      if (allGroups) {
        allGroups.forEach((grp: any) => {
          mapping[`grp_${grp.id}`] = grp.name;
          const overrides = safeParseJSON(grp.product_overrides);
          const targetCat = grp.target_category_name ? String(grp.target_category_name).trim().toUpperCase() : null;

          cleanIds.forEach(pId => {
            const prod = prodInfoMap[pId];
            const hasOverride = overrides[pId] || overrides[String(pId)];
            const hasCategoryMatch = targetCat && prod?.category && prod.category === targetCat;
            const hasSubcatMatch = grp.target_subcategory_id && prod?.subcategory_id && grp.target_subcategory_id === prod.subcategory_id;

            if (hasOverride || hasCategoryMatch || hasSubcatMatch) {
              mapping[pId] = grp.name;
              mapping[`dyn_${pId}`] = grp.name;
            }
          });
        });
      }

      // Si un produit n'a toujours pas de groupe assigné, utiliser sa catégorie de produit directe
      cleanIds.forEach(pId => {
        if (!mapping[pId] && prodInfoMap[pId]?.category) {
          mapping[pId] = prodInfoMap[pId].category;
          mapping[`dyn_${pId}`] = prodInfoMap[pId].category;
        }
      });
    }
  } catch (e) {
    console.error("Erreur chargement mapping option groups :", e);
  }

  return mapping;
};

/**
 * 🟢 2. FORMATEUR ET REGROUPEUR DES OPTIONS POUR L'AFFICHAGE (BORNE, CAISSE & KDS)
 */
export const getFormattedOrderOptions = (
  item: any, 
  groupMapping: Record<string, string> = {}
): FormattedOptionGroup[] => {
  let rawOptions: any[] = [];

  if (item.boisson) {
    rawOptions.push({
      name: typeof item.boisson === 'string' ? item.boisson : (item.boisson.name || ''),
      price: safeParseFloat(item.boisson.price),
      group_name: 'BOISSONS',
      id: item.boisson.id
    });
  }
  if (item.accompagnement) {
    rawOptions.push({
      name: typeof item.accompagnement === 'string' ? item.accompagnement : (item.accompagnement.name || ''),
      price: safeParseFloat(item.accompagnement.price),
      group_name: 'ACCOMPAGNEMENTS',
      id: item.accompagnement.id
    });
  }

  if (Array.isArray(item.boissonSubChoices)) {
    item.boissonSubChoices.forEach(b => {
      if (b) rawOptions.push({ ...b, group_name: b.group_name || 'BOISSONS' });
    });
  }
  if (Array.isArray(item.accompagnementSubChoices)) {
    item.accompagnementSubChoices.forEach(a => {
      if (a) rawOptions.push({ ...a, group_name: a.group_name || 'ACCOMPAGNEMENTS' });
    });
  }

  let primaryOpts: any[] = [];
  if (Array.isArray(item.selectedSubOptions) && item.selectedSubOptions.length > 0) primaryOpts = item.selectedSubOptions;
  else if (Array.isArray(item.flatOptions) && item.flatOptions.length > 0) primaryOpts = item.flatOptions;
  else if (Array.isArray(item.options) && item.options.length > 0) primaryOpts = item.options;
  else if (Array.isArray(item.selections) && item.selections.length > 0) primaryOpts = item.selections;
  else if (Array.isArray(item.directSubOptions) && item.directSubOptions.length > 0) primaryOpts = item.directSubOptions;

  primaryOpts.forEach(sub => {
    if (!sub) return;
    if (sub.options && Array.isArray(sub.options)) {
      const grpName = sub.group_name || sub.name || sub.groupName;
      const grpId = sub.groupId ?? sub.group_id ?? sub.option_group_id;
      sub.options.forEach(o => { 
        if (o) rawOptions.push({ 
          ...o, 
          group_name: o.group_name || grpName, 
          option_group_id: o.option_group_id || grpId,
          groupId: o.groupId || grpId
        }); 
      });
    } else if (typeof sub === 'object') {
      rawOptions.push(sub);
    } else if (typeof sub === 'string') {
      rawOptions.push({ name: sub, price: 0 });
    }
  });

  const optionsByCategory = new Map<string, FormattedOptionItem[]>();
  const processedSansNames = new Set<string>();

  // Ingrédients retirés (SANS ...)
  const removedIngs = item.removedIngredients || item.product?.removedIngredients || [];
  if (Array.isArray(removedIngs) && removedIngs.length > 0) {
    const catKey = 'INGRÉDIENTS';
    if (!optionsByCategory.has(catKey)) optionsByCategory.set(catKey, []);

    removedIngs.forEach((ing: any) => {
      const ingName = typeof ing === 'string' ? ing : (ing.name || ing.ingredient_name);
      if (ingName) {
        const normName = String(ingName).trim().toUpperCase();
        const displayName = normName.startsWith('SANS ') ? normName : `SANS ${normName}`;
        
        if (!processedSansNames.has(displayName)) {
          processedSansNames.add(displayName);
          optionsByCategory.get(catKey)!.push({ name: displayName, price: 0, qty: 1, isSans: true });
        }
      }
    });
  }

  rawOptions.forEach(opt => {
    if (!opt) return;
    const rawName = typeof opt === 'string' ? opt : (opt.name || opt.option_name || opt.title || opt.value || '');
    const name = String(rawName).trim();
    if (!name || name.toLowerCase() === 'option' || name.toLowerCase() === 'options...') return;

    const upperName = name.toUpperCase();
    const isSans = opt.groupName === 'Sans' || opt.group_name === 'Sans' || upperName.startsWith('SANS ') || !!opt.isRemoved || !!opt.isSans;
    const displayName = isSans && !upperName.startsWith('SANS ') ? `SANS ${upperName}` : upperName;

    if (isSans) {
      if (processedSansNames.has(displayName)) return;
      processedSansNames.add(displayName);

      const catKey = 'INGRÉDIENTS';
      if (!optionsByCategory.has(catKey)) optionsByCategory.set(catKey, []);
      optionsByCategory.get(catKey)!.push({ name: displayName, price: 0, qty: 1, isSans: true });
      return;
    }

    // 🟢 RÉSOUDRE LE NOM DU GROUPE PAR PRIORITÉ ABSOLUE
    const strOptId = opt.id ? String(opt.id) : '';
    const cleanOptId = strOptId.replace('dyn_', '');
    const mappedByOptId = groupMapping[strOptId] || groupMapping[cleanOptId] || groupMapping[`dyn_${cleanOptId}`];

    const explicitGrpId = opt.option_group_id || opt.group_id || opt.groupId;
    const mappedByGrpId = explicitGrpId ? (groupMapping[`grp_${explicitGrpId}`] || groupMapping[String(explicitGrpId)]) : null;

    let candidateGroup = opt.group_name || opt.option_group_name || opt.groupName || opt.group || opt.step_name;
    if (candidateGroup && (
      candidateGroup.toLowerCase() === 'option' || 
      candidateGroup.toLowerCase() === 'options' || 
      candidateGroup.toLowerCase() === 'options...' || 
      candidateGroup.toLowerCase() === 'choix'
    )) {
      candidateGroup = null;
    }

    const fallbackType = opt.type && opt.type.toLowerCase() !== 'option' && opt.type.toLowerCase() !== 'options' ? opt.type : null;
    const heuristicGroup = detectCategoryHeuristic(displayName);

    const finalGroupName = mappedByGrpId || mappedByOptId || candidateGroup || fallbackType || heuristicGroup || 'OPTIONS';
    const cleanCategoryKey = String(finalGroupName).trim().toUpperCase();
    const price = typeof opt === 'string' ? 0 : safeParseFloat(opt.price);

    if (!optionsByCategory.has(cleanCategoryKey)) {
      optionsByCategory.set(cleanCategoryKey, []);
    }

    const list = optionsByCategory.get(cleanCategoryKey)!;
    const existing = list.find(o => o.name.toUpperCase() === displayName && !o.isSans);

    if (existing) {
      existing.qty += 1;
      existing.price += price;
    } else {
      list.push({ name: displayName, price: price, qty: 1, isSans: false });
    }
  });

  return Array.from(optionsByCategory.entries()).map(([groupKey, items]) => ({
    groupName: '',
    originalGroupName: groupKey,
    items
  }));
};

/**
 * 🟢 3. PAYLOAD TICKET CLIENT
 */
export const buildClientReceiptPayload = (params: {
  restaurantId?: string | null;
  restaurantInfo: { name?: string; restaurant_name?: string; address?: string | null; phone?: string | null; tva?: number; logoUrl?: string | null };
  orderNumber: string;
  orderType: string;
  paymentMethod: string;
  items: any[];
  subtotal: number;
  deliveryFee?: number;
  finalTotal: number;
  clientInfo?: any;
  groupMapping?: Record<string, string>;
  orderDate?: string;
}) => {
  const {
    restaurantId,
    restaurantInfo,
    orderNumber,
    orderType,
    paymentMethod,
    items,
    deliveryFee = 0,
    finalTotal,
    clientInfo,
    groupMapping = {},
    orderDate
  } = params;

  let rawPayment = String(paymentMethod || 'counter').trim();
  const pLower = rawPayment.toLowerCase();

  if (pLower === 'counter' || pLower.includes('espece') || pLower.includes('cash')) {
    rawPayment = 'especes';
  } else if (pLower.includes('carte') || pLower.includes('cb') || pLower.includes('card') || pLower.includes('sumup')) {
    rawPayment = 'cb';
  } else if (pLower.includes('ticket') || pLower.includes('resto')) {
    rawPayment = 'ticket_resto';
  } else if (pLower.includes('attente') || pLower.includes('pending')) {
    rawPayment = 'en attente';
  }

  const formattedItems = items.map(item => {
    const optionGroups = getFormattedOrderOptions(item, groupMapping);
    const notes = optionGroups.flatMap(grp => grp.items.map(opt => ({
      name: (opt.qty > 1 ? `${opt.qty}x ` : '') + opt.name,
      price: opt.price || 0,
      isSans: opt.isSans
    })));
    return {
      qty: item.quantity || item.qty || 1,
      name: item.product?.name || item.name || 'Produit',
      unitPrice: item.price || item.product?.price || 0,
      notes,
      categoryName: item.product?.category_name || item.category || ''
    };
  });

  const restoName = restaurantInfo?.restaurant_name || restaurantInfo?.name || 'VOTRE RESTAURANT';

  return {
    restaurant_id: restaurantId,
    restaurantId: restaurantId,
    orderType,
    order_number: orderNumber,
    orderNumber: orderNumber,
    orderDate: orderDate || new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    restaurant_name: restoName,
    restaurantName: restoName,
    restaurantAddress: restaurantInfo?.address || null,
    restaurantPhone: restaurantInfo?.phone || null,
    restaurantLogoUrl: restaurantInfo?.logoUrl || null,
    payment_method: rawPayment,
    paymentMethod: rawPayment,
    tva: restaurantInfo?.tva || 10,
    items: formattedItems,
    total_price: finalTotal,
    total: finalTotal,
    delivery: orderType.toUpperCase().includes('LIVRAISON') ? {
      customerName: clientInfo?.name || clientInfo?.customer_name,
      address: clientInfo?.address || clientInfo?.customer_address,
      phone: clientInfo?.phone || clientInfo?.customer_phone,
      deliveryNotes: clientInfo?.notes || clientInfo?.additionalInfo || clientInfo?.comment || '',
      fee: deliveryFee
    } : undefined
  };
};

/**
 * 🟢 4. PAYLOAD BON CUISINE
 */
export const buildKitchenReceiptPayload = (params: {
  orderId?: string | number;
  orderNumber: string;
  orderType: string;
  restaurantName?: string;
  totalPrice?: number;
  isPaid?: boolean;
  orderDate?: string;
  items?: any[];
  groupMapping?: Record<string, string>;
}) => {
  const {
    orderId = '',
    orderNumber,
    orderType,
    restaurantName,
    totalPrice = 0,
    isPaid = false,
    orderDate,
    items = [],
    groupMapping = {}
  } = params;

  const formattedItems = items.map(item => {
    const optionGroups = getFormattedOrderOptions(item, groupMapping);
    const notes = optionGroups.flatMap(grp => grp.items.map(opt => ({
      name: (opt.qty > 1 ? `${opt.qty}x ` : '') + opt.name,
      price: opt.price || 0,
      isSans: opt.isSans
    })));
    return {
      qty: item.quantity || item.qty || 1,
      name: item.product?.name || item.name || 'Produit',
      unitPrice: item.price || item.product?.price || 0,
      notes,
      categoryName: item.product?.category_name || item.category || ''
    };
  });

  const rawRestoName = restaurantName || localStorage.getItem('restaurant_name') || 'VOTRE RESTAURANT';

  return {
    orderType: orderType.startsWith('CUISINE') ? orderType : `CUISINE - ${orderType}`,
    orderId: orderId,
    qrCodeValue: String(orderId || orderNumber),
    orderNumber: String(orderNumber),
    order_number: String(orderNumber),
    restaurantName: rawRestoName,
    restaurant_name: rawRestoName,
    totalPrice: Number(totalPrice || 0),
    total: Number(totalPrice || 0),
    isPaid: Boolean(isPaid),
    orderDate: orderDate || new Date().toISOString(),
    items: formattedItems
  };
};

/**
 * 🟢 5. MAPPING POUR OBJET SUPABASE 'ORDERS'
 */
export const buildReceiptPayloadFromOrder = async (
  order: any,
  optionGroupMapping: Record<string, string> = {},
  prefixOrderType: string = ''
) => {
  if (!order) return null;

  let rawItems: any[] = [];
  try {
    let details = typeof order.order_details === 'string' ? JSON.parse(order.order_details) : order.order_details;
    if (Array.isArray(details)) rawItems = details;
    else if (details && Array.isArray(details.items)) rawItems = details.items;
    else if (details && Array.isArray(details.cart)) rawItems = details.cart;
    else if (details) rawItems = [details];
  } catch (e) {
    rawItems = [];
  }

  let restoInfo = {
    name: 'VOTRE RESTAURANT',
    restaurant_name: 'VOTRE RESTAURANT',
    address: null as string | null,
    phone: null as string | null,
    tva: 10,
    logoUrl: null as string | null
  };

  const targetRestoId = order.restaurant_id || localStorage.getItem('pos_restaurant_id');

  if (targetRestoId) {
    try {
      const { data: restoData } = await supabase
        .from('restaurants')
        .select('name, restaurant_name, address, phone, tva, logo_url')
        .eq('id', targetRestoId)
        .maybeSingle();

      if (restoData) {
        restoInfo = {
          name: restoData.restaurant_name || restoData.name || 'VOTRE RESTAURANT',
          restaurant_name: restoData.restaurant_name || restoData.name || 'VOTRE RESTAURANT',
          address: restoData.address || null,
          phone: restoData.phone || null,
          tva: (restoData.tva !== null && restoData.tva !== undefined) ? Number(restoData.tva) : 10,
          logoUrl: restoData.logo_url || null
        };
      }
    } catch (e) {}
  }

  const ORDER_TYPE_LABELS: Record<string, string> = {
    '633425b1-f86c-4c17-8cba-b258906ad317': 'SUR PLACE',
    '2cac3f10-73e2-40a5-a7e0-053bd861b4d9': 'EMPORTER',
    'c48b80a4-0dcd-4f75-9e67-a99d30bf4f9d': 'LIVRAISON'
  };

  let rawTypeLabel = String(order.order_type || '').toUpperCase();
  if (!rawTypeLabel || rawTypeLabel === 'UNDEFINED') {
    rawTypeLabel = ORDER_TYPE_LABELS[order.order_type_id] || 'SUR PLACE';
  }

  const finalOrderType = prefixOrderType ? `${prefixOrderType} - ${rawTypeLabel}` : rawTypeLabel;

  return buildClientReceiptPayload({
    restaurantId: targetRestoId,
    restaurantInfo: restoInfo,
    orderNumber: String(order.order_number || order.number || order.id || '001'),
    orderType: finalOrderType,
    paymentMethod: order.payment_method || order.paymentMethod || 'especes',
    items: rawItems,
    subtotal: Number(order.total_price || order.total || 0),
    deliveryFee: Number(order.delivery_fee || 0),
    finalTotal: Number(order.total_price || order.total || 0),
    clientInfo: {
      name: order.customer_name,
      phone: order.customer_phone,
      address: order.customer_address,
      notes: order.comment
    },
    groupMapping: optionGroupMapping,
    orderDate: order.created_at ? new Date(order.created_at).toLocaleString('fr-FR') : undefined
  });
};