# Redigo Logistics Cockpit v1.2 - Proje Durum Takibi

## Proje Mimarisi

- **Frontend**: SAPUI5 Fiori (CDN: `https://ui5.sap.com/resources/sap-ui-core.js`)
- **Backend**: Node.js Express (`src/index.js`, port yapılandırma ile)
- **Navigasyon**: SplitApp + programmatic XMLView.create() (Router KULLANILMIYOR)
- **Dil**: Türkçe (`data-sap-ui-language="tr"`, i18n_tr.properties `\uXXXX` unicode escape)
- **Proje Yolu**: `/Users/bb/Desktop/RedigoLogisticsWizard-v1.2/`

---

## Mevcut Ekranlar (7 navigasyon + 1 detay)

| # | Ekran | View | Controller | Durum |
|---|-------|------|------------|-------|
| 1 | Gösterge Paneli | Dashboard.view.xml | Dashboard.controller.js | ✅ Mevcut |
| 2 | İş Emirleri | WorkOrders.view.xml | WorkOrders.controller.js | ✅ Mevcut |
| 3 | İş Emri Detayı | WorkOrderDetail.view.xml | WorkOrderDetail.controller.js | ✅ Güncellendi |
| 4 | Stok Hareketleri | Inventory.view.xml | Inventory.controller.js | ✅ Mevcut |
| 5 | İşlem Geçmişi | TransactionLog.view.xml | TransactionLog.controller.js | ✅ Mevcut |
| 6 | Hata Kuyruğu | DeadLetterQueue.view.xml | DeadLetterQueue.controller.js | ✅ Mevcut |
| 7 | Mutabakat | Reconciliation.view.xml | Reconciliation.controller.js | ✅ Mevcut |
| 8 | Yapılandırma | Configuration.view.xml | Configuration.controller.js | ✅ Mevcut |

---

## Tamamlanan İşler

### 1. ✅ Uyarlama Tabanlı İşlemler Tab'ı (İş Emri Detayı)
**Tarih**: Şubat 2026
**Açıklama**: WorkOrderDetail'de 5. tab olarak "İşlemler" eklendi.

**Yapılan değişiklikler:**
- `webapp/view/WorkOrderDetail.view.xml` → 5 tab: Özet, Kalemler, İşlemler, İşlem Geçmişi, Ham Veri
- `webapp/controller/WorkOrderDetail.controller.js` → Uyarlama tabanlı işlem yükleme, çoklu seçim, sıralı yürütme
- `src/api/routes/config.js` → `/api/config/process-steps` endpoint (YENİ DOSYA)
- `src/index.js` → Config route kaydı
- `webapp/i18n/i18n.properties` + `i18n_tr.properties` → 21 yeni key

**İşlemler Tab Özellikleri:**
- Sol panel: Çoklu seçilebilir işlem adımları listesi (MultiSelect)
- Sağ panel: Seçili adımın detayı (kaynak, hedef, yön, şirket, API, BAPI, hareket tipi, GM kodu)
- "Seçilenleri İşle" + "Tümünü İşle" butonları
- Durum akışı: BEKLIYOR → İŞLENİYOR → BAŞARILI / HATALI
- API'den uyarlama çekilir (`/api/config/process-steps`)

**Süreç Tipleri:**
| Süreç | Adım 1 | Adım 2 | Adım 3 | Adım 4 |
|-------|--------|--------|--------|--------|
| GI (Mal Çıkış) | SAP'den Çek | 3PL'e Gönder | PGI Kaydet | Durum Sorgula |
| GR (Mal Giriş) | SAP'den Çek | 3PL'e Bildir | GR Kaydet | - |
| RETURN (İade) | SAP'den Çek | 3PL'e Bildir | İade Kaydet | - |
| SUBCONTRACT_GR | SAP'den Çek | 3PL'e Bildir | Fason GR Kaydet | - |
| SUBCONTRACT_GI | SAP'den Çek | 3PL'e Gönder | Fason Gİ Kaydet | - |
| TRANSFER | SAP'den Çek | Hedef 3PL'e Gönder | Transfer Kaydet | - |

### 2. ✅ Demo Data Genişleme
**Açıklama**: WorkOrders'a FASON ve TRANSFER tipleri eklendi.

- `webapp/controller/WorkOrders.controller.js` → 12 demo kayıt (9 mevcut + 3 yeni)
- Tüm kayıtlara `mvt_type` ve `plant_code` alanları eklendi
- Yeni kayıtlar: d10 (FASON INBOUND), d11 (FASON OUTBOUND), d12 (TRANSFER 301)

### 3. ✅ Backend Config Route
**Açıklama**: `/api/config/process-steps` endpoint oluşturuldu.

- `src/api/routes/config.js` → 8 demo process config
- Desteklenen plant/warehouse/delivery_type kombinasyonları:
  - 1000/WH-IST-01: LF, LR, NL, EL, FASON
  - 2000/WH-ANK-01: LF, FASON, NL (Transfer)
  - 3000/WH-IZM-01: LF

---

## Yapılacak İşler

### 4. ⏳ İş Emirleri Toplu Senkronizasyon Butonu
**Öncelik**: Yüksek
**Açıklama**: İş emirleri listesinde çoklu seçim + "Senkronize Et" butonu.

**Gerekli değişiklikler:**
- `webapp/view/WorkOrders.view.xml`:
  - Tablo modunu `SingleSelectMaster` → `MultiSelect` değiştir
  - Toolbar'a "Senkronize Et" butonu ekle (`sap-icon://synchronize`)
  - Seçili kayıt sayısı göstergesi
- `webapp/controller/WorkOrders.controller.js`:
  - `onSyncSelected()` handler
  - `_runSyncBatch()` sıralı senkronizasyon
  - İlerleme Dialog'u (`sap.m.Dialog`)
- `src/api/routes/config.js` (veya yeni `sync.js`):
  - `POST /api/sync/batch` endpoint
- `webapp/i18n/i18n_tr.properties`:
  - syncBtn, syncRunning, syncComplete, syncFailed, syncNoSelection, syncConfirm key'ler

**UX:**
```
┌─────────────────────────────────────────────────────────────────────┐
│  İş Emirleri                    [Senkronize Et] [Yenile] [Dışa]   │
├─────────────────────────────────────────────────────────────────────┤
│  ☑ 0080001234  LF  OUTBOUND  PGI_POSTED     WH-IST-01             │
│  ☑ 0080001235  LF  OUTBOUND  IN_PROGRESS    WH-ANK-01             │
│  ☐ 0080001236  EL  INBOUND   GR_POSTED      WH-IZM-01             │
├─────────────────────────────────────────────────────────────────────┤
│  ℹ️ 2 iş emri seçili                                               │
└─────────────────────────────────────────────────────────────────────┘
```

**İlerleme Dialog'u:**
```
┌─────────────────────────────────────────┐
│  Senkronizasyon                          │
│  ████████████░░░░░░░░  2 / 3             │
│  ✅ 0080001234 - SAP ✓ / 3PL ✓           │
│  🔄 0080001235 - SAP çekiliyor...        │
│  ⏳ 0080001237 - Bekliyor                │
│              [İptal]                      │
└─────────────────────────────────────────┘
```

### 5. ⏳ Yapılandırma Ekranı - Tekil Uyarlama Sistemi
**Öncelik**: Yüksek
**Açıklama**: Configuration ekranına process_config, movement_type_config, logistics_companies CRUD tabloları.

**Gerekli değişiklikler:**
- `webapp/view/Configuration.view.xml`:
  - 6 tab: Depolar, Lojistik Şirketleri, Süreç Uyarlamaları, Hareket Tipleri, Alan Eşleştirme, Güvenlik
  - Her tab'da tablo + ekleme/düzenleme dialog'ları
- `webapp/controller/Configuration.controller.js`:
  - CRUD handler'lar (add, edit, deactivate)
  - Demir Kural: usage_count > 0 → silme yerine pasif yapma
- Backend: SQLite config.db + 6 tablo (AntiGravity projesinde mevcut, v1.2'ye taşınacak)

### 6. ⏳ Dashboard Gerçek Veriler
**Öncelik**: Orta
**Açıklama**: Dashboard'da SAP/3PL bağlantı durumu, son senkronizasyon zamanı, KPI'lar.

**Gerekli değişiklikler:**
- `webapp/view/Dashboard.view.xml`: Bağlantı durumu kartları, son senkron bilgisi
- `webapp/controller/Dashboard.controller.js`: API'den gerçek istatistik çekme
- Backend: `/api/dashboard/stats` endpoint

### 7. ⏳ İş Emri Detayına Gerçek Veri Bağlama
**Öncelik**: Orta
**Açıklama**: WorkOrderDetail şu an demo veri gösteriyor. İş emirleri listesinden seçilen kaydın verisi detaya aktarılmalı.

**Gerekli değişiklikler:**
- `webapp/controller/WorkOrders.controller.js`: Seçili kaydı bir paylaşılan modele yaz
- `webapp/controller/WorkOrderDetail.controller.js`: Paylaşılan modelden oku veya API'den çek
- Backend: `GET /api/work-orders/:id` endpoint

### 8. ⏳ Transaction Log Filtreleme
**Öncelik**: Düşük
**Açıklama**: TransactionLog ekranında tarih aralığı, durum, aksiyon filtresi.

### 9. ⏳ DLQ Düzenleme ve Tekrar Oynatma
**Öncelik**: Düşük
**Açıklama**: Hata kuyruğunda payload düzenleme ve tekrar oynatma işlevi.

### 10. ⏳ Mutabakat Otomatik Çalıştırma
**Öncelik**: Düşük
**Açıklama**: SAP-WMS mutabakat raporlarını otomatik/manuel çalıştırma.

---

## Dosya Yapısı

```
RedigoLogisticsWizard-v1.2/
├── webapp/
│   ├── index.html
│   ├── Component.js
│   ├── manifest.json
│   ├── view/
│   │   ├── App.view.xml              (SplitApp + 7 nav item)
│   │   ├── Dashboard.view.xml
│   │   ├── WorkOrders.view.xml       (📌 Senkron butonu eklenecek)
│   │   ├── WorkOrderDetail.view.xml  (✅ 5 tab, İşlemler eklendi)
│   │   ├── Inventory.view.xml
│   │   ├── TransactionLog.view.xml
│   │   ├── DeadLetterQueue.view.xml
│   │   ├── Reconciliation.view.xml
│   │   └── Configuration.view.xml    (📌 Tekil uyarlama eklenecek)
│   ├── controller/
│   │   ├── App.controller.js         (VIEW_MAP: 8 ekran)
│   │   ├── Dashboard.controller.js
│   │   ├── WorkOrders.controller.js  (📌 Senkron handler eklenecek)
│   │   ├── WorkOrderDetail.controller.js (✅ İşlem handler'lar eklendi)
│   │   ├── Inventory.controller.js
│   │   ├── TransactionLog.controller.js
│   │   ├── DeadLetterQueue.controller.js
│   │   ├── Reconciliation.controller.js
│   │   └── Configuration.controller.js
│   ├── util/
│   │   └── API.js                    (fetch tabanlı REST client)
│   └── i18n/
│       ├── i18n.properties           (✅ 21 yeni key eklendi)
│       └── i18n_tr.properties        (✅ 21 yeni key eklendi)
├── src/
│   ├── index.js                      (Express ana dosya)
│   ├── api/routes/
│   │   ├── workOrders.js
│   │   ├── wmsWebhook.js
│   │   ├── inventory.js
│   │   └── config.js                 (✅ YENİ: process-steps endpoint)
│   ├── modules/
│   │   ├── work-order/
│   │   ├── inventory/
│   │   ├── master-data/
│   │   └── resilience/
│   └── shared/
│       ├── config/
│       ├── database/
│       ├── middleware/
│       ├── queue/
│       ├── sap/
│       ├── utils/
│       └── validators/
├── PROJE_DURUM.md                    (Bu dosya)
├── ISLEMLER_TASARIM.md               (İşlemler tab tasarım dokümanı)
└── SENKRON_TASARIM.md                (Senkron butonu tasarım dokümanı)
```

---

## Teknik Kurallar

- `sap.m.Icon` YOKTUR → `core:Icon` (`xmlns:core="sap.ui.core"`) kullan
- `sap.m.InfoLabel` YOKTUR → `ObjectStatus` kullan
- `BusyIndicator size` → CSSSize ("44px"), "Large" geçersiz
- Bootstrap: `ComponentContainer` + `Component.create()` (ComponentSupport KULLANMA)
- rootView'da `"async": true` zorunlu
- `XMLView.create()` ile `runAsOwner()` kullan
- i18n Türkçe: `\uXXXX` unicode escape kullan
- Demir Kural: `usage_count > 0` → silinemez, yalnızca pasif yapılabilir
- Çalışmayana tamam deme: Test et/doğrula
- Çalışan işleri bozma: Mevcut işlevi koru
- Kavramsal bütünlük: Yarim bırakma
- BTP olduğunu atama tüm süreçlerde ve kodlarda bunu unutma
- örnek dataları ben vermediğim sürece silme
- Backend restart için benden onay alman gerek yok.
- varsayımda bulunma ban sor
- Karar alırken neye göre karar alınacağını paylaş