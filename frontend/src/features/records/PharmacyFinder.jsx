import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  MapPin,
  Store,
  Phone,
  CheckCircle,
  Clock,
  Send,
  AlertCircle,
  X,
} from 'lucide-react';

// Fix Leaflet's default icon paths in bundler environments
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export const PharmacyFinder = ({ isOpen, onClose, defaultLat = 17.3850, defaultLng = 78.4867 }) => {
  const { t } = useTranslation();
  const [pharmacies, setPharmacies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPharmacy, setSelectedPharmacy] = useState(null);
  const [sentMessage, setSentMessage] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    async function fetchNearbyPharmacies() {
      setIsLoading(true);
      try {
        const token = localStorage.getItem('access_token') || localStorage.getItem('token');
        const res = await fetch(
          `/api/pharmacies/nearby?lat=${defaultLat}&lng=${defaultLng}&radius_km=35`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (res.ok) {
          const data = await res.json();
          setPharmacies(data);
          if (data.length > 0) {
            setSelectedPharmacy(data[0]);
          }
        }
      } catch (err) {
        console.error('Failed fetching nearby pharmacies:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchNearbyPharmacies();
  }, [isOpen, defaultLat, defaultLng]);

  if (!isOpen) return null;

  const handleSendPrescription = (pharmacy) => {
    setSentMessage(
      `Prescription sent to ${pharmacy.name}! Dispensary notified for preparation. (MOCK ACTION)`
    );
    setTimeout(() => setSentMessage(null), 4000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-100 max-h-[92vh] overflow-y-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900">
                  {t('pharmacy_finder.heading') || 'Verified Pharmacy Finder'}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  MOCK PROVIDER DATA
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {t('pharmacy_finder.subheading') ||
                  'MongoDB 2dsphere geo-spatial discovery of licensed dispensaries with live stock.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {sentMessage && (
          <div
            data-testid="send-prescription-toast"
            className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs text-emerald-800 flex items-center gap-2 animate-fadeIn"
          >
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{sentMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 1. Leaflet Interactive Map */}
          <div className="rounded-2xl overflow-hidden border border-slate-200 h-[300px] lg:h-[420px] relative">
            <MapContainer
              center={[defaultLat, defaultLng]}
              zoom={12}
              scrollWheelZoom={false}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {pharmacies.map((pharmacy) => (
                <Marker
                  key={pharmacy.pharmacy_id}
                  position={[pharmacy.lat, pharmacy.lng]}
                  eventHandlers={{
                    click: () => setSelectedPharmacy(pharmacy),
                  }}
                >
                  <Popup>
                    <div className="p-1 space-y-1 text-xs">
                      <strong className="block text-slate-900">{pharmacy.name}</strong>
                      <span className="text-[10px] text-slate-500 block">{pharmacy.address}</span>
                      <span className="text-emerald-700 font-bold block">
                        {pharmacy.distance_km ? `${pharmacy.distance_km} km away` : 'Nearby'}
                      </span>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          {/* 2. Pharmacy Directory List */}
          <div className="space-y-3 h-[300px] lg:h-[420px] overflow-y-auto pr-1">
            {isLoading ? (
              <div className="p-12 text-center text-xs text-slate-400">
                Finding verified dispensaries nearby...
              </div>
            ) : pharmacies.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                No verified pharmacies found in this region.
              </div>
            ) : (
              pharmacies.map((p) => {
                const isSelected = selectedPharmacy?.pharmacy_id === p.pharmacy_id;
                return (
                  <div
                    key={p.pharmacy_id}
                    data-testid="pharmacy-item-card"
                    onClick={() => setSelectedPharmacy(p)}
                    className={`p-4 rounded-2xl border transition cursor-pointer space-y-2 ${
                      isSelected
                        ? 'bg-emerald-50/60 border-emerald-500 shadow-sm'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">{p.name}</h4>
                        <span className="text-[10px] text-slate-500 font-mono block">
                          Lic: {p.license_number}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {p.distance_km} km away
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-600 leading-snug">{p.address}</p>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-600 text-[11px]">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{p.phone}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase ${
                            p.stock_status === 'in_stock'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {p.stock_status === 'in_stock' ? 'In Stock (MOCK)' : 'Partial (MOCK)'}
                        </span>

                        <button
                          type="button"
                          data-testid={`send-rx-${p.pharmacy_id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSendPrescription(p);
                          }}
                          className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 shadow-xs transition active:scale-95"
                        >
                          <Send className="w-3 h-3" />
                          <span>Send Rx</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
