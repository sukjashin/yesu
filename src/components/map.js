import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { venueData } from '../data/venues.js';
import { popupHTML } from './common.js';

export let map = null;
export const markers = {};

function numberedIcon(num, color) {
  return L.divIcon({
    className: '',
    html: `<div style="
        width:30px;height:30px;border-radius:50% 50% 50% 0;
        background:${color}; transform:rotate(-45deg);
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 3px 8px rgba(0,0,0,0.3); border:2px solid #fff;">
        <span style="transform:rotate(45deg); color:#fff; font-weight:800; font-size:13px;">${num}</span>
      </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 28]
  });
}

export function initMap() {
  const mapEl = document.getElementById('map');
  if (!mapEl) return { map: null, markers };

  try {
    map = L.map('map', { scrollWheelZoom: false }).setView([34.715, 127.76], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const venueLocations = Object.values(venueData).map((v) => [v.lat, v.lng]);

    Object.values(venueData).forEach((v) => {
      const marker = L.marker([v.lat, v.lng], {
        icon: numberedIcon(v.id, v.color)
      }).addTo(map);

      marker.bindPopup(popupHTML(v));
      markers[v.id] = marker;
    });

    if (venueLocations.length) {
      map.fitBounds(L.latLngBounds(venueLocations), {
        padding: [40, 40],
        maxZoom: 12
      });
    }
  } catch (error) {
    console.error('지도 초기화 실패:', error);
    mapEl.innerHTML = '<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#4b5a76;font-size:13px;text-align:center;padding:20px;">지도를 불러오지 못했습니다.<br/>네트워크 상태를 확인한 뒤 새로고침해 주세요.</div>';
  }

  return { map, markers };
}
