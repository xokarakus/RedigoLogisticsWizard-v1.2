# İş Emirleri ve İşlemler Senkronizasyon Butonu - Tasarım

## Amaç

İş emirleri listesinde ve/veya detayda bir **"Senkronize Et"** butonu ile tüm iş emirlerinin
SAP ve 3PL sistemleri ile güncel durumlarının otomatik eşleştirilmesi.

## Kullanım Senaryoları

### 1. Toplu Senkronizasyon (İş Emirleri Listesi)
```
┌─────────────────────────────────────────────────────────────────────┐
│  İş Emirleri                           [Senkronize Et] [Yenile]    │
├─────────────────────────────────────────────────────────────────────┤
│  ☑ 0080001234  LF  OUTBOUND  PGI_POSTED     WH-IST-01             │
│  ☑ 0080001235  LF  OUTBOUND  IN_PROGRESS    WH-ANK-01             │
│  ☐ 0080001236  EL  INBOUND   GR_POSTED      WH-IZM-01             │
│  ☑ 0080001237  NL  INBOUND   RECEIVED       WH-IST-01             │
├─────────────────────────────────────────────────────────────────────┤
│  ℹ️ 3 iş emri seçili. "Senkronize Et" ile SAP/3PL durumları       │
│     güncellenecek.                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

**İşleyiş:**
- Kullanıcı listeden bir veya birden fazla iş emri seçer
- "Senkronize Et" butonuna tıklar
- Her seçili iş emri için sırasıyla:
  1. SAP'den güncel durum çekilir (`/api/trigger/fetch-from-sap`)
  2. 3PL'den güncel durum sorgulanır (`/api/trigger/query-status`)
  3. Durum bilgileri güncellenir
- İlerleme çubuğu gösterilir

### 2. Tekli Senkronizasyon (İş Emri Detayı - İşlemler Tab)
Mevcut "İşle" / "Tümünü İşle" butonlarına ek olarak:
- Zaten mevcut yapıda "Tümünü İşle" butonu bu işlevi karşılıyor
- Detay seviyesinde ayrı bir senkron butonu gerekmeyebilir

### 3. Otomatik Senkronizasyon (Opsiyonel)
- Her X dakikada bir arka planda senkronizasyon
- Dashboard'da "Son Senkronizasyon: 14:32" bilgisi
- Yapılandırma ekranında senkron aralığı ayarı

## API Gereksinimleri

### Mevcut API'ler (kullanılacak)
```
POST /api/trigger/fetch-from-sap   → SAP'den güncel veri çek
POST /api/trigger/send-to-3pl      → 3PL'e bilgi gönder
GET  /api/trigger/query-status     → 3PL'den durum sorgula (YENİ)
```

### Yeni Endpoint: Toplu Senkron
```
POST /api/sync/batch
Body: {
  delivery_nos: ["0080001234", "0080001235", "0080001237"],
  sync_type: "FULL"        // FULL | SAP_ONLY | 3PL_ONLY
}

Response: {
  success: true,
  results: [
    { delivery_no: "0080001234", sap_synced: true, wms_synced: true, new_status: "PGI_POSTED" },
    { delivery_no: "0080001235", sap_synced: true, wms_synced: false, error: "3PL timeout" },
    { delivery_no: "0080001237", sap_synced: true, wms_synced: true, new_status: "IN_PROGRESS" }
  ],
  summary: { total: 3, success: 2, failed: 1 }
}
```

## UX Detayları

### Senkron Butonu Durumları
- **Normal**: `sap-icon://synchronize` + "Senkronize Et"
- **Çalışıyor**: `BusyIndicator` + "Senkronize Ediliyor... (2/5)"
- **Tamamlandı**: `MessageToast` + "3 iş emri senkronize edildi"
- **Hatalı**: `MessageBox.warning` + hata detayları

### İlerleme Gösterimi
```
┌─────────────────────────────────────────┐
│  Senkronizasyon                          │
│                                          │
│  ████████████░░░░░░░░  3 / 5             │
│                                          │
│  ✅ 0080001234 - SAP ✓ / 3PL ✓           │
│  ✅ 0080001235 - SAP ✓ / 3PL ✓           │
│  🔄 0080001237 - SAP çekiliyor...        │
│  ⏳ 4500001001 - Bekliyor                │
│  ⏳ 4500001003 - Bekliyor                │
│                                          │
│              [İptal]                      │
└─────────────────────────────────────────┘
```

## Değişecek Dosyalar

### v1.2 Projesi
1. **`webapp/view/WorkOrders.view.xml`** → Senkron butonu ekle + liste MultiSelect modu
2. **`webapp/controller/WorkOrders.controller.js`** → `onSyncSelected()` handler
3. **`webapp/i18n/i18n_tr.properties`** → Yeni Türkçe key'ler
4. **`src/api/routes/config.js`** → `/api/sync/batch` endpoint (veya ayrı route dosyası)

### AntiGravity Projesi (aynı değişiklikler)
5. **`webapp/view/WorkOrders.view.xml`** → Aynı
6. **`webapp/controller/WorkOrders.controller.js`** → Aynı
7. **`MiddlewareEngine/src/server.js`** → `/api/sync/batch` endpoint

## Uygulama Adımları

1. Backend: `/api/sync/batch` endpoint oluştur
2. WorkOrders view: Toolbar'a "Senkronize Et" butonu + MultiSelect modu
3. WorkOrders controller: `onSyncSelected()`, `_runSyncBatch()` handler'ları
4. İlerleme Dialog'u: `sap.m.Dialog` ile ilerleme gösterimi
5. i18n: Türkçe key'ler
6. Test ve doğrulama

## i18n Key'ler

```properties
# Sync
syncBtn=Senkronize Et
syncRunning=Senkronize Ediliyor...
syncComplete={0} i\u015f emri senkronize edildi
syncFailed=Senkronizasyon s\u0131ras\u0131nda {0} hata olu\u015ftu
syncNoSelection=Senkronize etmek i\u00e7in en az bir i\u015f emri se\u00e7in
syncConfirm={0} i\u015f emri i\u00e7in SAP/3PL senkronizasyonu ba\u015flat\u0131ls\u0131n m\u0131?
syncProgress=\u0130lerleme
syncCancel=\u0130ptal
syncSAPOk=SAP \u2713
sync3PLOk=3PL \u2713
syncSAPFail=SAP \u2717
sync3PLFail=3PL \u2717
syncWaiting=Bekliyor
syncProcessing=\u0130\u015fleniyor
```
