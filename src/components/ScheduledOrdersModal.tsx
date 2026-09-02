// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { X, CalendarClock, Play, Clock, User, Phone } from 'lucide-react';

interface ScheduledOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: any[];
  onForceSendToKitchen: (orderId: string | number) => void;
  themeColors?: { primary: string; secondary: string };
}

const parseOrderDetails = (details: any): any[] => {
  if (Array.isArray(details)) return details;
  if (typeof details === 'string') {
    try {
      const parsed = JSON.parse(details);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.items)) return parsed.items;
      return [parsed];
    } catch (e) {
      return [];
    }
  }
  return [];
};

export const ScheduledOrdersModal: React.FC<ScheduledOrdersModalProps> = ({
  isOpen,
  onClose,
  orders,
  onForceSendToKitchen,
  themeColors = { primary: '#FBBF24', secondary: '#1e293b' }
}) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!isOpen) return null;

  // 🟢 FILTRE STRICT : Uniquement les vraies commandes programmées (> 30 min après la création ET > 30 min de maintenant)
  const scheduledOrders = orders
    .filter(order => {
      if (!order.scheduled_time) return false;
      const schedTime = new Date(order.scheduled_time).getTime();
      const createdTime = new Date(order.created_at).getTime();
      if (isNaN(schedTime) || isNaN(createdTime)) return false;

      const diffFromCreationMinutes = (schedTime - createdTime) / 60000;
      const diffFromNowMinutes = (schedTime - now.getTime()) / 60000;

      // Si le délai est de 10-15 min, c'est une commande normale -> EXCLUE
      // On ne garde que les commandes programmées à plus de 30 min
      return diffFromCreationMinutes > 30 && diffFromNowMinutes > 30;
    })
    .sort((a, b) => new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime());

  const formatCountdown = (scheduledTimeStr: string) => {
    const schedTime = new Date(scheduledTimeStr).getTime();
    const diffMs = schedTime - now.getTime();
    if (diffMs <= 0) return "Imminent";

    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;

    if (hours > 0) {
      return `Dans ${hours}h ${mins.toString().padStart(2, '0')}m`;
    }
    return `Dans ${mins} min`;
  };

  const formatTime = (timeStr: string) => {
    return new Date(timeStr).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 2xl:p-10 font-helvetica select-none">
      <div className="bg-[#1e293b] w-full max-w-5xl border-2 border-slate-700 flex flex-col max-h-[90vh] rounded-none shadow-2xl">
        
        {/* HEADER */}
        <div className="p-4 2xl:p-6 border-b border-white/10 flex justify-between items-center bg-[#0f172a]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-400">
              <CalendarClock className="w-6 h-6 2xl:w-8 2xl:h-8" />
            </div>
            <div>
              <h2 className="text-lg 2xl:text-2xl font-black uppercase text-white tracking-wide">
                Commandes Programmées
              </h2>
              <p className="text-xs 2xl:text-sm text-slate-400 font-bold">
                {scheduledOrders.length} commande(s) programmée(s) à l'avance (&gt; 30 min)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-2 transition-colors">
            <X className="w-6 h-6 2xl:w-8 2xl:h-8" />
          </button>
        </div>

        {/* LISTE DES COMMANDES */}
        <div className="flex-1 overflow-y-auto p-4 2xl:p-6 space-y-3.5 custom-scrollbar bg-slate-900">
          {scheduledOrders.length === 0 ? (
            <div className="text-center py-16 text-slate-500 flex flex-col items-center gap-3">
              <CalendarClock className="w-16 h-16 opacity-40" />
              <p className="text-base 2xl:text-xl font-bold uppercase">Aucune commande programmée à plus de 30 minutes</p>
            </div>
          ) : (
            scheduledOrders.map(order => {
              const schedTime = new Date(order.scheduled_time).getTime();
              const diffMinutes = (schedTime - now.getTime()) / 60000;
              const isOverOneHour = diffMinutes >= 60;
              const items = parseOrderDetails(order.order_details);

              return (
                <div 
                  key={order.id} 
                  className={`border-2 p-4 2xl:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all rounded-none ${
                    isOverOneHour 
                      ? 'bg-slate-800/80 border-slate-700' 
                      : 'bg-amber-950/30 border-amber-500/60'
                  }`}
                >
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 2xl:gap-3">
                      <span className="text-base 2xl:text-2xl font-black text-white bg-slate-950 px-2.5 py-1 border border-slate-700">
                        {order.order_number || `#${order.id.toString().slice(-3)}`}
                      </span>

                      <span className="bg-amber-500 text-slate-950 font-black text-xs 2xl:text-base px-2.5 py-1 flex items-center gap-1.5 uppercase">
                        <Clock className="w-4 h-4" /> Prévu à {formatTime(order.scheduled_time)}
                      </span>

                      <span className={`font-black text-xs 2xl:text-sm px-2.5 py-1 uppercase ${
                        isOverOneHour 
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' 
                          : 'bg-orange-500/20 text-orange-300 border border-orange-500/40 animate-pulse'
                      }`}>
                        {formatCountdown(order.scheduled_time)}
                      </span>
                    </div>

                    {(order.customer_name || order.customer_phone) && (
                      <div className="flex items-center gap-4 text-xs 2xl:text-sm text-slate-300 font-bold">
                        {order.customer_name && (
                          <span className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-slate-400" /> {order.customer_name}
                          </span>
                        )}
                        {order.customer_phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5 text-slate-400" /> {order.customer_phone}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="text-xs 2xl:text-sm text-slate-400 line-clamp-2">
                      <span className="font-bold text-slate-300 mr-1">Articles :</span>
                      {items.map((it: any) => `${it.quantity || 1}x ${it.product?.name || it.name || 'Article'}`).join(' • ')}
                    </div>
                  </div>

                  <div className="flex-shrink-0">
                    <button
                      onClick={() => onForceSendToKitchen(order.id)}
                      className="w-full md:w-auto bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-black text-xs 2xl:text-sm uppercase tracking-wider px-4 py-3 flex items-center justify-center gap-2 rounded-none transition-all shadow-lg"
                      title="Envoyer immédiatement sur le KDS sans attendre"
                    >
                      <Play className="w-4 h-4 fill-current" /> Lancer en cuisine
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
};