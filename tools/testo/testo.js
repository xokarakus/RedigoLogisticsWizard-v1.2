/* ═══════════════════════════════════════════
   TESTO v1.0 — Redigo Logistics Wizard Process Testing
   ═══════════════════════════════════════════ */
const STORAGE_KEY = 'testo_data';

function getDefaultScenarios() {
    return [
        // ── WORK ORDER SÜREÇ TESTLERİ ──
        {
            id: 'SCN001', code: 'RDG-WO-ING-001', name: 'Work Order Ingest (Outbound)', module: 'MM', priority: 'critical',
            description: 'SAP\'tan gelen outbound delivery verisinin Redigo middleware üzerinden WMS\'e aktarılma süreci.',
            preconditions: 'API sunucusu çalışıyor olmalı, depo tanımı (WH-IST-01) aktif olmalı',
            expectedResult: 'Work order oluşturulmalı, status RECEIVED olmalı, WMS\'e iletim kuyruğuna alınmalı',
            steps: [
                { id: 's1', action: 'Redigo API health check (/health)', type: 'verification', expected: 'status: ok, version: 1.2.0' },
                { id: 's2', action: 'POST /api/work-orders/ingest — Outbound delivery payload gönder', type: 'action', expected: '201 Created, work order ID dönmeli' },
                { id: 's3', action: 'Delivery no, type, doc_date, ship_to, lines doğrulaması', type: 'verification', expected: 'Tüm alanlar DB\'ye yazılmış olmalı' },
                { id: 's4', action: 'Work Order statüsü RECEIVED olarak kontrol', type: 'verification', expected: 'status: RECEIVED' },
                { id: 's5', action: 'Dashboard KPI - todayIngest sayacı artmış olmalı', type: 'verification', expected: 'todayIngest +1' },
                { id: 's6', action: 'Work Orders listesinde yeni kayıt görünmeli', type: 'verification', expected: 'Delivery no listede görünür' }
            ], status: 'NOT_RUN', lastRun: null, lastDuration: null
        },
        {
            id: 'SCN002', code: 'RDG-WO-ING-002', name: 'Work Order Ingest (Inbound)', module: 'MM', priority: 'critical',
            description: 'SAP\'tan gelen inbound delivery (EL tipi) verisinin Redigo üzerinden işlenmesi.',
            preconditions: 'API çalışıyor, depo tanımı aktif',
            expectedResult: 'Inbound work order oluşturulmalı',
            steps: [
                { id: 's1', action: 'POST /api/work-orders/ingest — Inbound (EL) delivery gönder', type: 'action', expected: '201 Created' },
                { id: 's2', action: 'order_type: INBOUND olarak kaydedilmiş mi kontrol', type: 'verification', expected: 'order_type: INBOUND' },
                { id: 's3', action: 'Line items (kalemler) doğru kaydedilmiş mi', type: 'verification', expected: 'Kalem sayısı eşleşmeli' },
                { id: 's4', action: 'Duplicate delivery_no gönderildiğinde UPSERT çalışmalı', type: 'verification', expected: 'ON CONFLICT güncelleme yapmalı' }
            ], status: 'NOT_RUN', lastRun: null, lastDuration: null
        },
        {
            id: 'SCN003', code: 'RDG-WO-ING-003', name: 'Work Order Ingest — Hata Senaryoları', module: 'MM', priority: 'high',
            description: 'Geçersiz veri ile ingest API\'nin doğru hata dönüşü kontrol edilir.',
            preconditions: 'API çalışıyor',
            expectedResult: 'Uygun HTTP hata kodları ve mesajları dönmeli',
            steps: [
                { id: 's1', action: 'Bilinmeyen warehouse_code ile ingest dene', type: 'action', expected: '400 — Unknown warehouse' },
                { id: 's2', action: 'Boş payload ile ingest dene', type: 'action', expected: '400 veya 500 hata' },
                { id: 's3', action: 'Eksik zorunlu alanlarla ingest dene', type: 'action', expected: 'Validation hatası' },
                { id: 's4', action: 'Çok büyük payload (5MB+) ile ingest dene', type: 'action', expected: '413 veya uygun hata' }
            ], status: 'NOT_RUN', lastRun: null, lastDuration: null
        },

        // ── WMS ENTEGRASYON TESTLERİ ──
        {
            id: 'SCN004', code: 'RDG-WMS-CNF-001', name: 'WMS Confirmation — Outbound Pick', module: 'SD', priority: 'critical',
            description: 'WMS\'den gelen outbound toplama (pick) onayının Redigo üzerinden işlenmesi ve SAP PGI tetiklenmesi.',
            preconditions: 'Mevcut outbound work order (SENT_TO_WMS statüsünde)',
            expectedResult: 'Pick onayı alınmalı, SAP PGI çağrılmalı, status PGI_POSTED olmalı',
            steps: [
                { id: 's1', action: 'POST /api/wms/confirmation — pick onay payload gönder', type: 'action', expected: '200 OK' },
                { id: 's2', action: 'Zod schema validasyonu geçmeli', type: 'verification', expected: 'Payload valid olmalı' },
                { id: 's3', action: 'Work order delivery_no ile eşleşmeli', type: 'verification', expected: 'Work order bulunmalı' },
                { id: 's4', action: 'processOutboundConfirmation çağrılmalı', type: 'verification', expected: 'BAPI_OUTB_DELIVERY_CHANGE çağrısı' },
                { id: 's5', action: 'SAP WS_DELIVERY_UPDATE (PGI) çağrısı', type: 'verification', expected: 'PGI posted successfully' },
                { id: 's6', action: 'Work order status → PGI_POSTED güncellenmeli', type: 'verification', expected: 'status: PGI_POSTED' },
                { id: 's7', action: 'Transaction log kaydı oluşmalı', type: 'verification', expected: 'Log entry mevcut' }
            ], status: 'NOT_RUN', lastRun: null, lastDuration: null
        },
        {
            id: 'SCN005', code: 'RDG-WMS-CNF-002', name: 'WMS Confirmation — Inbound Receipt', module: 'SD', priority: 'critical',
            description: 'WMS\'den gelen inbound mal kabul onayının işlenmesi ve SAP GR tetiklenmesi.',
            preconditions: 'Mevcut inbound work order',
            expectedResult: 'GR onayı alınmalı, SAP goods receipt oluşturulmalı',
            steps: [
                { id: 's1', action: 'POST /api/wms/confirmation — inbound receipt payload', type: 'action', expected: '200 OK' },
                { id: 's2', action: 'processInboundConfirmation çağrılmalı', type: 'verification', expected: 'BAPI_GOODSMVT_CREATE çağrısı' },
                { id: 's3', action: 'Malzeme belgesi numarası (MAT_DOC) dönmeli', type: 'verification', expected: 'MAT_DOC mevcut' },
                { id: 's4', action: 'BAPI_TRANSACTION_COMMIT çağrılmalı', type: 'verification', expected: 'Committed' },
                { id: 's5', action: 'Work order status → GR_POSTED', type: 'verification', expected: 'status: GR_POSTED' }
            ], status: 'NOT_RUN', lastRun: null, lastDuration: null
        },
        {
            id: 'SCN006', code: 'RDG-WMS-CNF-003', name: 'WMS Confirmation — Hata Senaryoları', module: 'SD', priority: 'high',
            description: 'Geçersiz WMS confirmation payload\'larının doğru şekilde reddedilmesi.',
            preconditions: 'API çalışıyor',
            expectedResult: 'Zod validasyon hataları ve uygun HTTP yanıtları',
            steps: [
                { id: 's1', action: 'Geçersiz schema ile confirmation gönder', type: 'action', expected: '400 — Validation failed' },
                { id: 's2', action: 'Mevcut olmayan delivery_no ile gönder', type: 'action', expected: '404 — Work order not found' },
                { id: 's3', action: 'Eksik line items ile gönder', type: 'action', expected: 'Validation hatası' }
            ], status: 'NOT_RUN', lastRun: null, lastDuration: null
        },

        // ── ENVANTER HAREKETLERİ ──
        {
            id: 'SCN007', code: 'RDG-INV-MOV-001', name: 'Inventory Movement — Hurda Çıkışı (551)', module: 'WM', priority: 'high',
            description: 'WMS SCRAP hareket kodunun Redigo üzerinden SAP 551 hareket tipine eşlenmesi.',
            preconditions: 'Movement mapping aktif (WH-IST-01, SCRAP→551)',
            expectedResult: 'Envanter hareketi kuyruğa alınmalı, SAP BAPI çağrılmalı',
            steps: [
                { id: 's1', action: 'POST /api/inventory/movement — SCRAP hareketi', type: 'action', expected: '202 Accepted' },
                { id: 's2', action: 'Movement mapping tablosunda eşleşme bulunmalı', type: 'verification', expected: 'Mapping: SCRAP → 551' },
                { id: 's3', action: 'Transaction log PENDING olarak oluşmalı', type: 'verification', expected: 'status: PENDING' },
                { id: 's4', action: 'SAP BAPI_GOODSMVT_CREATE çağrısı', type: 'verification', expected: 'Goods movement posted' },
                { id: 's5', action: 'Transaction log status → COMPLETED', type: 'verification', expected: 'status: COMPLETED' }
            ], status: 'NOT_RUN', lastRun: null, lastDuration: null
        },
        {
            id: 'SCN008', code: 'RDG-INV-MOV-002', name: 'Inventory Movement — Depo Transferi (311)', module: 'WM', priority: 'high',
            description: 'WMS TRANSFER_SLOC hareket kodunun SAP 311 storage location transfer eşlemesi.',
            preconditions: 'Movement mapping aktif (WH-IST-01, TRANSFER_SLOC→311)',
            expectedResult: 'Transfer hareketi işlenmeli',
            steps: [
                { id: 's1', action: 'POST /api/inventory/movement — TRANSFER_SLOC hareketi', type: 'action', expected: '202 Accepted' },
                { id: 's2', action: 'Hedef depo yeri (sap_to_stor_loc: 0002) doğru eşlenmeli', type: 'verification', expected: 'Doğru depo yeri' },
                { id: 's3', action: 'SAP hareket belgesi oluşmalı', type: 'verification', expected: 'MAT_DOC dönmeli' }
            ], status: 'NOT_RUN', lastRun: null, lastDuration: null
        },
        {
            id: 'SCN009', code: 'RDG-INV-MOV-003', name: 'Inventory Movement — Tesis Arası Transfer (301)', module: 'WM', priority: 'medium',
            description: 'WMS TRANSFER_PLANT kodunun SAP 301 plant transfer eşlemesi.',
            preconditions: 'Movement mapping aktif (WH-ANK-01, TRANSFER_PLANT→301)',
            expectedResult: 'Tesis arası transfer belgesi oluşmalı',
            steps: [
                { id: 's1', action: 'POST /api/inventory/movement — TRANSFER_PLANT hareketi', type: 'action', expected: '202 Accepted' },
                { id: 's2', action: 'Hedef tesis (sap_to_plant: 3000) doğru eşlenmeli', type: 'verification', expected: 'Plant 3000' },
                { id: 's3', action: 'SAP hareket belgesi kontrolü', type: 'verification', expected: 'Belge oluşmuş olmalı' }
            ], status: 'NOT_RUN', lastRun: null, lastDuration: null
        },
        {
            id: 'SCN010', code: 'RDG-INV-MAP-001', name: 'Inventory Mappings Listeleme', module: 'WM', priority: 'medium',
            description: 'GET /api/inventory/mappings endpoint\'inin doğru çalışması.',
            preconditions: 'Aktif mapping kayıtları mevcut',
            expectedResult: 'Tüm aktif mappingler listelenmeli',
            steps: [
                { id: 's1', action: 'GET /api/inventory/mappings çağrısı', type: 'action', expected: '200 OK, data array' },
                { id: 's2', action: 'Her mapping warehouse_code içermeli', type: 'verification', expected: 'warehouse_code mevcut' },
                { id: 's3', action: 'Sadece is_active=true kayıtlar gelmeli', type: 'verification', expected: 'Tüm kayıtlar aktif' },
                { id: 's4', action: 'wms_action_code → sap_movement_type eşlemesi doğru', type: 'verification', expected: 'Eşlemeler tutarlı' }
            ], status: 'NOT_RUN', lastRun: null, lastDuration: null
        },

        // ── UI SÜREÇ TESTLERİ ──
        {
            id: 'SCN011', code: 'RDG-UI-DASH-001', name: 'Dashboard Yükleme ve KPI Kontrolü', module: 'LE', priority: 'critical',
            description: 'Redigo Cockpit Dashboard ekranının doğru yüklenmesi ve KPI verilerinin gösterilmesi.',
            preconditions: 'Frontend erişilebilir, API çalışıyor veya demo mod aktif',
            expectedResult: 'Dashboard tüm KPI tile\'ları ve son siparişler ile yüklenmeli',
            steps: [
                { id: 's1', action: 'Cockpit ana sayfa açılışı', type: 'navigation', expected: 'Dashboard view yüklenmeli' },
                { id: 's2', action: 'KPI tile\'ları: Toplam Sipariş, Devam Eden, Bugün Tamamlanan', type: 'verification', expected: 'Sayılar görünür olmalı' },
                { id: 's3', action: 'KPI tile\'ları: Hatalı, Bugün Ingest, SAP Bekleyen', type: 'verification', expected: 'Sayılar görünür olmalı' },
                { id: 's4', action: 'Son siparişler tablosu yüklenmeli', type: 'verification', expected: 'En az demo veriler görünür' },
                { id: 's5', action: 'Yenile butonu çalışmalı', type: 'action', expected: 'Veriler yenilenmeli' },
                { id: 's6', action: 'Sipariş satırına tıklama → Work Order Detail navigasyon', type: 'action', expected: 'Detay sayfası açılmalı' }
            ], status: 'NOT_RUN', lastRun: null, lastDuration: null
        },
        {
            id: 'SCN012', code: 'RDG-UI-WO-001', name: 'Work Orders Listesi ve Filtreleme', module: 'LE', priority: 'high',
            description: 'Work Orders ekranının yüklenmesi, arama ve filtreleme fonksiyonları.',
            preconditions: 'Frontend erişilebilir',
            expectedResult: 'Work orders listesi filtrelenebilir olmalı',
            steps: [
                { id: 's1', action: 'Work Orders sayfasına navigasyon', type: 'navigation', expected: 'Tablo yüklenmeli' },
                { id: 's2', action: 'Delivery no ile arama', type: 'action', expected: 'Filtrelenmiş sonuçlar' },
                { id: 's3', action: 'Order type filtresi (INBOUND/OUTBOUND)', type: 'action', expected: 'Doğru filtreleme' },
                { id: 's4', action: 'Status filtresi (RECEIVED, IN_PROGRESS, vb.)', type: 'action', expected: 'Doğru filtreleme' },
                { id: 's5', action: 'Satıra tıklama → Detay sayfası', type: 'action', expected: 'WorkOrderDetail açılmalı' }
            ], status: 'NOT_RUN', lastRun: null, lastDuration: null
        },
        {
            id: 'SCN013', code: 'RDG-UI-CFG-001', name: 'Konfigürasyon — Depo Yönetimi', module: 'LE', priority: 'high',
            description: 'Depo tanımlarının görüntülenmesi, ekleme, düzenleme ve arşivleme süreçleri.',
            preconditions: 'Configuration sayfası erişilebilir',
            expectedResult: 'Depo CRUD işlemleri çalışmalı, Demir Kural: silme yerine arşivleme',
            steps: [
                { id: 's1', action: 'Configuration sayfasına git', type: 'navigation', expected: 'Depo ve mapping listeleri yüklenmeli' },
                { id: 's2', action: 'Depo listesi: WH-IST-01, WH-ANK-01, WH-IZM-01 görünmeli', type: 'verification', expected: '3 aktif depo görünür' },
                { id: 's3', action: 'Depo arşivleme — onay dialogu gösterilmeli', type: 'action', expected: 'Demir Kural uyarısı: silinemez' },
                { id: 's4', action: 'Arşivleme onaylandığında is_active=false olmalı', type: 'verification', expected: 'Depo pasif duruma geçmeli' },
                { id: 's5', action: 'SAP Plant ve Storage Location bilgileri doğru gösterilmeli', type: 'verification', expected: 'Plant/SLoc doğru' }
            ], status: 'NOT_RUN', lastRun: null, lastDuration: null
        },
        {
            id: 'SCN014', code: 'RDG-UI-CFG-002', name: 'Konfigürasyon — Movement Mapping', module: 'LE', priority: 'high',
            description: 'WMS action → SAP movement type eşleme yönetimi.',
            preconditions: 'Configuration sayfası erişilebilir',
            expectedResult: 'Mapping CRUD işlemleri çalışmalı',
            steps: [
                { id: 's1', action: 'Mapping listesi yüklenmeli', type: 'verification', expected: 'Aktif mappingler listelenir' },
                { id: 's2', action: 'WMS Action Code ve SAP Movement Type eşlemesi doğru görünmeli', type: 'verification', expected: 'SCRAP→551, DAMAGED→344, vb.' },
                { id: 's3', action: 'Mapping arşivleme — Demir Kural uyarısı', type: 'action', expected: 'Silinemez, devre dışı bırakılır' },
                { id: 's4', action: 'Mapping düzenleme butonu çalışmalı', type: 'action', expected: 'Edit dialog açılmalı' }
            ], status: 'NOT_RUN', lastRun: null, lastDuration: null
        },

        // ── SAP RFC & ALTYAPI TESTLERİ ──
        {
            id: 'SCN015', code: 'RDG-SAP-RFC-001', name: 'SAP RFC Bağlantı ve Mock Modu', module: 'INT', priority: 'critical',
            description: 'SAP RFC client\'ın initialize edilmesi, mock modda doğru çalışması.',
            preconditions: 'Uygulama başlatılabilir olmalı',
            expectedResult: 'Mock modda tüm BAPI çağrıları simülasyon yanıtı dönmeli',
            steps: [
                { id: 's1', action: 'SAP Client initialize — development modda mock olmalı', type: 'verification', expected: 'MOCK mode: true' },
                { id: 's2', action: 'BAPI_OUTB_DELIVERY_CHANGE mock çağrısı', type: 'action', expected: 'TYPE: S, Delivery updated' },
                { id: 's3', action: 'WS_DELIVERY_UPDATE mock çağrısı', type: 'action', expected: 'TYPE: S, PGI posted' },
                { id: 's4', action: 'BAPI_GOODSMVT_CREATE mock çağrısı', type: 'action', expected: 'MAT_DOC ve DOC_YEAR dönmeli' },
                { id: 's5', action: 'BAPI_TRANSACTION_COMMIT mock çağrısı', type: 'action', expected: 'TYPE: S, Committed' },
                { id: 's6', action: 'Tanımsız BAPI çağrısı — fallback yanıt', type: 'action', expected: 'Mock: [function] OK' }
            ], status: 'NOT_RUN', lastRun: null, lastDuration: null
        },
        {
            id: 'SCN016', code: 'RDG-E2E-OB-001', name: 'Uçtan Uca — Outbound Delivery Süreci', module: 'INT', priority: 'critical',
            description: 'SAP Delivery → Redigo Ingest → WMS Gönderim → WMS Pick Onay → SAP PGI tam süreç testi.',
            preconditions: 'API çalışıyor, mock mod aktif, depo tanımlı',
            expectedResult: 'Tüm E2E süreç başarıyla tamamlanmalı, her adımda doğru status geçişleri',
            steps: [
                { id: 's1', action: 'POST /api/work-orders/ingest — Outbound delivery oluştur', type: 'action', expected: 'status: RECEIVED' },
                { id: 's2', action: 'Work order durumu RECEIVED → SENT_TO_WMS geçişi', type: 'verification', expected: 'Status geçişi doğru' },
                { id: 's3', action: 'WMS\'den pick confirmation geldi', type: 'action', expected: 'POST /api/wms/confirmation başarılı' },
                { id: 's4', action: 'SAP BAPI_OUTB_DELIVERY_CHANGE çağrıldı', type: 'verification', expected: 'Delivery updated' },
                { id: 's5', action: 'SAP PGI (WS_DELIVERY_UPDATE) çağrıldı', type: 'verification', expected: 'PGI posted' },
                { id: 's6', action: 'Work order final status: PGI_POSTED / COMPLETED', type: 'verification', expected: 'Süreç tamamlandı' },
                { id: 's7', action: 'Transaction log — tüm adımlar kaydedilmiş', type: 'verification', expected: 'Tam log mevcut' },
                { id: 's8', action: 'Dashboard KPI güncellenmiş', type: 'verification', expected: 'completedToday +1' }
            ], status: 'NOT_RUN', lastRun: null, lastDuration: null
        },
        {
            id: 'SCN017', code: 'RDG-E2E-IB-001', name: 'Uçtan Uca — Inbound Delivery Süreci', module: 'INT', priority: 'critical',
            description: 'SAP Inbound Delivery → Redigo → WMS Kabul → GR Posting tam süreç.',
            preconditions: 'API çalışıyor, mock mod aktif',
            expectedResult: 'Inbound E2E süreç başarılı',
            steps: [
                { id: 's1', action: 'POST /api/work-orders/ingest — Inbound delivery oluştur', type: 'action', expected: 'status: RECEIVED' },
                { id: 's2', action: 'WMS\'den receipt confirmation geldi', type: 'action', expected: 'Confirmation başarılı' },
                { id: 's3', action: 'SAP BAPI_GOODSMVT_CREATE çağrıldı (GR)', type: 'verification', expected: 'Goods receipt posted' },
                { id: 's4', action: 'BAPI_TRANSACTION_COMMIT çağrıldı', type: 'verification', expected: 'Committed' },
                { id: 's5', action: 'Work order final status: GR_POSTED / COMPLETED', type: 'verification', expected: 'GR tamamlandı' },
                { id: 's6', action: 'Transaction log kaydı', type: 'verification', expected: 'Tam log mevcut' }
            ], status: 'NOT_RUN', lastRun: null, lastDuration: null
        },
        {
            id: 'SCN018', code: 'RDG-DLQ-001', name: 'Dead Letter Queue İşleme', module: 'INT', priority: 'medium',
            description: 'Başarısız işlemlerin Dead Letter Queue\'ya düşmesi ve yeniden işlenmesi.',
            preconditions: 'DLQ arayüzü erişilebilir',
            expectedResult: 'Hatalı mesajlar DLQ\'da görünmeli ve retry mekanizması çalışmalı',
            steps: [
                { id: 's1', action: 'DLQ sayfasına navigasyon', type: 'navigation', expected: 'DLQ listesi yüklenmeli' },
                { id: 's2', action: 'Hatalı mesajlar listelenmeli', type: 'verification', expected: 'Hata detayları görünür' },
                { id: 's3', action: 'Retry butonu ile yeniden işleme', type: 'action', expected: 'Mesaj yeniden kuyruğa alınmalı' },
                { id: 's4', action: 'Başarılı retry sonrası DLQ\'dan kalkmalı', type: 'verification', expected: 'DLQ count azalmalı' }
            ], status: 'NOT_RUN', lastRun: null, lastDuration: null
        }
    ];
}

// ─── App State & Persistence ───
class TestoApp {
    constructor() {
        this.scenarios = []; this.runs = []; this.editingScenarioId = null;
        this.settings = { apiUrl: 'http://localhost:3000', mode: 'mock', timeout: 30000, parallel: 3 };
        this.load(); this.init();
    }
    load() {
        try {
            const d = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            if (d) { this.scenarios = d.scenarios || getDefaultScenarios(); this.runs = d.runs || []; if (d.settings) this.settings = { ...this.settings, ...d.settings }; }
            else this.scenarios = getDefaultScenarios();
        } catch (e) { this.scenarios = getDefaultScenarios(); this.runs = []; }
    }
    save() { localStorage.setItem(STORAGE_KEY, JSON.stringify({ scenarios: this.scenarios, runs: this.runs, settings: this.settings })); }

    init() {
        this.bindNav(); this.bindDashboard(); this.bindScenarios(); this.bindExecution(); this.bindReports(); this.bindSettings(); this.bindModals();
        this.updateDashboard(); this.renderScenarios(); this.renderExecutionChecklist(); this.renderReports(); this.updateStatusBar();
        setInterval(() => this.updateClock(), 1000); this.updateClock();
    }

    // ─── NAV ───
    bindNav() { document.querySelectorAll('.nav-item').forEach(el => { el.addEventListener('click', e => { e.preventDefault(); this.navigateTo(el.dataset.view); }); }); }
    navigateTo(v) {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === v));
        document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === `view-${v}`));
        if (v === 'dashboard') this.updateDashboard(); if (v === 'scenarios') this.renderScenarios();
        if (v === 'execution') this.renderExecutionChecklist(); if (v === 'reports') this.renderReports();
    }

    // ─── DASHBOARD ───
    bindDashboard() {
        document.getElementById('btnRefreshDashboard').onclick = () => { this.updateDashboard(); this.toast('Dashboard yenilendi', 'info'); };
        document.getElementById('btnRunAllFromDash').onclick = () => { this.navigateTo('execution'); this.selectAll(); };
    }
    updateDashboard() {
        const s = this.scenarios, pass = s.filter(x => x.status === 'PASS').length, fail = s.filter(x => x.status === 'FAIL').length,
            warn = s.filter(x => x.status === 'WARNING').length, nr = s.filter(x => x.status === 'NOT_RUN').length, ran = s.length - nr;
        document.getElementById('kpiTotalScenarios').textContent = s.length;
        document.getElementById('kpiPassed').textContent = pass; document.getElementById('kpiFailed').textContent = fail;
        document.getElementById('kpiWarning').textContent = warn; document.getElementById('kpiNotRun').textContent = nr;
        document.getElementById('kpiPassRate').textContent = ran > 0 ? Math.round(pass / ran * 100) + '%' : '—';
        this.renderProcessMap(); this.renderRecentRuns();
    }
    renderProcessMap() {
        document.getElementById('processMap').innerHTML = this.scenarios.map(s => {
            const c = s.status === 'PASS' ? 'pass' : s.status === 'FAIL' ? 'fail' : s.status === 'WARNING' ? 'warning' : 'not-run';
            return `<div class="process-card" onclick="app.navigateTo('scenarios')"><span class="process-dot ${c}"></span>
        <div class="process-info"><span class="process-name">${s.name}</span><span class="process-code">${s.code}</span></div>
        <span class="process-count">${s.steps.length} adım</span></div>`;
        }).join('');
    }
    renderRecentRuns() {
        const body = document.getElementById('recentRunsBody'), recent = this.runs.slice(-5).reverse();
        if (!recent.length) { body.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:24px">Henüz çalıştırma yok</td></tr>'; return; }
        body.innerHTML = recent.map(r => {
            const c = r.failed > 0 ? 'fail' : r.warnings > 0 ? 'warning' : 'pass';
            return `<tr><td style="font-family:'JetBrains Mono',monospace;font-size:12px">${r.id}</td><td>${this.fmtDate(r.date)}</td><td>${r.total}</td>
        <td style="color:var(--green)">${r.passed}</td><td style="color:var(--red)">${r.failed}</td><td style="color:var(--amber)">${r.warnings}</td>
        <td>${r.duration}s</td><td><span class="status-tag ${c}"><span class="status-tag-dot"></span>${c === 'pass' ? 'Başarılı' : c === 'fail' ? 'Başarısız' : 'Uyarılı'}</span></td></tr>`;
        }).join('');
    }

    // ─── SCENARIOS ───
    bindScenarios() {
        document.getElementById('scenarioSearch').oninput = () => this.renderScenarios();
        document.getElementById('scenarioFilterModule').onchange = () => this.renderScenarios();
        document.getElementById('scenarioFilterStatus').onchange = () => this.renderScenarios();
        document.getElementById('btnNewScenario').onclick = () => this.openScenarioModal();
    }
    getFiltered() {
        let l = [...this.scenarios]; const q = document.getElementById('scenarioSearch').value.toLowerCase(),
            m = document.getElementById('scenarioFilterModule').value, st = document.getElementById('scenarioFilterStatus').value;
        if (q) l = l.filter(s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q));
        if (m !== 'all') l = l.filter(s => s.module === m); if (st !== 'all') l = l.filter(s => s.status === st); return l;
    }
    renderScenarios() {
        const grid = document.getElementById('scenarioGrid'), list = this.getFiltered();
        if (!list.length) { grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">Senaryo bulunamadı</div>'; return; }
        grid.innerHTML = list.map(s => {
            const c = s.status === 'PASS' ? 'pass' : s.status === 'FAIL' ? 'fail' : s.status === 'WARNING' ? 'warning' : 'not-run';
            const sl = s.status === 'PASS' ? '✓ Başarılı' : s.status === 'FAIL' ? '✗ Başarısız' : s.status === 'WARNING' ? '⚠ Uyarı' : '○ Çalıştırılmadı';
            return `<div class="scenario-card ${c}" data-id="${s.id}">
        <div class="sc-header"><div><div class="sc-title">${s.name}</div><div class="sc-code">${s.code}</div></div><span class="sc-module-badge ${s.module}">${s.module}</span></div>
        <div class="sc-meta"><span class="sc-meta-item"><span class="priority-dot ${s.priority}"></span>${this.pLabel(s.priority)}</span>
          <span class="sc-meta-item">📋 ${s.steps.length} adım</span><span class="sc-meta-item"><span class="status-tag ${c}" style="padding:2px 6px;font-size:10px"><span class="status-tag-dot"></span>${sl}</span></span></div>
        <div class="sc-steps-preview">${s.steps.slice(0, 4).map((st, i) => `<div class="sc-step-item"><span class="sc-step-num">${i + 1}</span><span>${st.action}</span></div>`).join('')}${s.steps.length > 4 ? `<div style="font-size:10px;color:var(--text-muted);padding-left:28px">+${s.steps.length - 4} adım daha...</div>` : ''}</div>
        <div class="sc-footer"><div class="sc-actions">
          <button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();app.runSingle('${s.id}')">▶ Çalıştır</button>
          <button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();app.editScenario('${s.id}')">✎ Düzenle</button>
          <button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();app.deleteScenario('${s.id}')" style="color:var(--red)">🗑</button>
        </div><span class="sc-last-run">${s.lastRun ? this.fmtDate(s.lastRun) : 'Hiç çalıştırılmadı'}</span></div></div>`;
        }).join('');
    }

    // ─── SCENARIO MODAL ───
    bindModals() {
        document.getElementById('btnCloseScenarioModal').onclick = () => this.closeModal('scenarioModal');
        document.getElementById('btnCancelScenario').onclick = () => this.closeModal('scenarioModal');
        document.getElementById('btnSaveScenario').onclick = () => this.saveScenario();
        document.getElementById('btnAddStep').onclick = () => this.addStepEditor();
        document.getElementById('btnCloseReportModal').onclick = () => this.closeModal('reportDetailModal');
        document.getElementById('btnCloseStepDetail').onclick = () => this.closeModal('stepDetailModal');
        document.querySelectorAll('.modal-overlay').forEach(m => { m.addEventListener('click', e => { if (e.target === m) this.closeModal(m.id); }); });
    }
    openScenarioModal(sc = null) {
        this.editingScenarioId = sc ? sc.id : null;
        document.getElementById('scenarioModalTitle').textContent = sc ? 'Senaryo Düzenle' : 'Yeni Test Senaryosu';
        document.getElementById('scnName').value = sc?.name || ''; document.getElementById('scnCode').value = sc?.code || `RDG-${Date.now().toString(36).toUpperCase()}`;
        document.getElementById('scnModule').value = sc?.module || 'MM'; document.getElementById('scnPriority').value = sc?.priority || 'medium';
        document.getElementById('scnDescription').value = sc?.description || ''; document.getElementById('scnPreconditions').value = sc?.preconditions || '';
        document.getElementById('scnExpectedResult').value = sc?.expectedResult || '';
        const ed = document.getElementById('stepsEditor'); ed.innerHTML = '';
        (sc?.steps || [{ id: 's1', action: '', type: 'navigation', expected: '', sapTcode: '' }]).forEach(s => this.addStepEditor(s));
        document.getElementById('scenarioModal').style.display = 'flex';
    }
    addStepEditor(step = null) {
        const ed = document.getElementById('stepsEditor'), idx = ed.children.length + 1, div = document.createElement('div');
        div.className = 'step-editor-item';
        div.innerHTML = `<span class="step-editor-num">${idx}</span><div class="step-editor-fields">
      <input type="text" placeholder="Adım açıklaması..." class="step-action" value="${step?.action || ''}">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <select class="step-type"><option value="navigation" ${step?.type === 'navigation' ? 'selected' : ''}>Navigasyon</option><option value="transaction" ${step?.type === 'transaction' ? 'selected' : ''}>İşlem</option><option value="input" ${step?.type === 'input' ? 'selected' : ''}>Veri Girişi</option><option value="action" ${step?.type === 'action' ? 'selected' : ''}>Aksiyon</option><option value="verification" ${step?.type === 'verification' ? 'selected' : ''}>Doğrulama</option></select>
        <input type="text" placeholder="Endpoint / T-Code" class="step-tcode" value="${step?.sapTcode || ''}">
      </div><input type="text" placeholder="Beklenen sonuç..." class="step-expected" value="${step?.expected || ''}">
    </div><button class="step-remove-btn" onclick="this.closest('.step-editor-item').remove();app.renumberSteps()">✕</button>`;
        ed.appendChild(div);
    }
    renumberSteps() { document.querySelectorAll('#stepsEditor .step-editor-num').forEach((el, i) => el.textContent = i + 1); }
    saveScenario() {
        const name = document.getElementById('scnName').value.trim(), code = document.getElementById('scnCode').value.trim();
        if (!name || !code) { this.toast('Ad ve kod zorunludur', 'error'); return; }
        const steps = []; document.querySelectorAll('#stepsEditor .step-editor-item').forEach((el, i) => {
            const a = el.querySelector('.step-action').value.trim();
            if (a) steps.push({ id: `s${i + 1}`, action: a, type: el.querySelector('.step-type').value, expected: el.querySelector('.step-expected').value.trim(), sapTcode: el.querySelector('.step-tcode').value.trim() });
        }); if (!steps.length) { this.toast('En az bir adım gerekli', 'error'); return; }
        const data = {
            code, name, module: document.getElementById('scnModule').value, priority: document.getElementById('scnPriority').value,
            description: document.getElementById('scnDescription').value.trim(), preconditions: document.getElementById('scnPreconditions').value.trim(),
            expectedResult: document.getElementById('scnExpectedResult').value.trim(), steps
        };
        if (this.editingScenarioId) { const i = this.scenarios.findIndex(s => s.id === this.editingScenarioId); if (i >= 0) this.scenarios[i] = { ...this.scenarios[i], ...data }; }
        else { data.id = 'SCN' + Date.now().toString(36).toUpperCase(); data.status = 'NOT_RUN'; data.lastRun = null; data.lastDuration = null; this.scenarios.push(data); }
        this.save(); this.renderScenarios(); this.closeModal('scenarioModal'); this.toast(this.editingScenarioId ? 'Senaryo güncellendi' : 'Yeni senaryo oluşturuldu', 'success');
    }
    editScenario(id) { const s = this.scenarios.find(x => x.id === id); if (s) this.openScenarioModal(s); }
    deleteScenario(id) { if (!confirm('Silmek istediğinize emin misiniz?')) return; this.scenarios = this.scenarios.filter(s => s.id !== id); this.save(); this.renderScenarios(); this.toast('Senaryo silindi', 'warning'); }

    // ─── EXECUTION ───
    bindExecution() {
        document.getElementById('btnSelectAll').onclick = () => this.selectAll();
        document.getElementById('btnDeselectAll').onclick = () => this.deselectAll();
        document.getElementById('btnRunSelected').onclick = () => this.runSelected();
    }
    renderExecutionChecklist() {
        document.getElementById('executionChecklist').innerHTML = this.scenarios.map(s => `<div class="exec-check-item" data-id="${s.id}" onclick="app.toggleCheck(this)">
      <div class="exec-checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>
      <div class="exec-check-info"><div class="exec-check-name">${s.name}</div><div class="exec-check-code">${s.code} · ${s.module} · ${s.steps.length} adım</div></div>
      <span class="sc-module-badge ${s.module}">${s.module}</span></div>`).join('');
        this.updateSelCnt();
    }
    toggleCheck(el) { el.classList.toggle('selected'); this.updateSelCnt(); }
    selectAll() { document.querySelectorAll('.exec-check-item').forEach(e => e.classList.add('selected')); this.updateSelCnt(); }
    deselectAll() { document.querySelectorAll('.exec-check-item').forEach(e => e.classList.remove('selected')); this.updateSelCnt(); }
    updateSelCnt() { const c = document.querySelectorAll('.exec-check-item.selected').length; document.getElementById('selectedCount').textContent = `${c} seçili`; document.getElementById('btnRunSelected').disabled = c === 0; }

    async runSingle(id) { this.navigateTo('execution'); setTimeout(() => { this.deselectAll(); const el = document.querySelector(`.exec-check-item[data-id="${id}"]`); if (el) { el.classList.add('selected'); this.updateSelCnt(); } this.runSelected(); }, 100); }

    async runSelected() {
        const ids = [...document.querySelectorAll('.exec-check-item.selected')].map(e => e.dataset.id); if (!ids.length) return;
        const panel = document.getElementById('executionProgressPanel'); panel.style.display = 'block';
        const log = document.getElementById('executionLog'), bar = document.getElementById('executionProgressBar'), badge = document.getElementById('executionStatus');
        log.innerHTML = ''; bar.style.width = '0%'; badge.textContent = 'Çalışıyor...'; badge.className = 'panel-badge live-badge';
        const t0 = Date.now(); const timer = setInterval(() => { document.getElementById('progressTime').textContent = this.fmtElapsed(Date.now() - t0); }, 100);
        let passed = 0, failed = 0, warnings = 0;
        this.addLog(log, 'info', 'ℹ', 'Redigo süreç testi başlatılıyor...', `${ids.length} senaryo seçildi`);
        for (let i = 0; i < ids.length; i++) {
            const sc = this.scenarios.find(s => s.id === ids[i]); if (!sc) continue;
            document.getElementById('progressText').textContent = `${i + 1} / ${ids.length}`; bar.style.width = `${((i + 1) / ids.length) * 100}%`;
            this.addLog(log, 'running', '⟳', `Senaryo: ${sc.name}`, `${sc.code} · ${sc.steps.length} adım`);
            const res = await this.simulate(sc, log);
            sc.status = res.status; sc.lastRun = new Date().toISOString(); sc.lastDuration = res.duration;
            if (res.status === 'PASS') { passed++; this.addLog(log, 'pass', '✓', `${sc.name}: BAŞARILI`, `${res.duration}s`); }
            else if (res.status === 'FAIL') { failed++; this.addLog(log, 'fail', '✗', `${sc.name}: BAŞARISIZ`, res.message); }
            else { warnings++; this.addLog(log, 'warning', '⚠', `${sc.name}: UYARI`, res.message); }
        }
        clearInterval(timer); const dur = ((Date.now() - t0) / 1000).toFixed(1);
        badge.textContent = failed > 0 ? 'Başarısız' : warnings > 0 ? 'Uyarılı' : 'Başarılı';
        this.addLog(log, failed > 0 ? 'fail' : warnings > 0 ? 'warning' : 'pass', '■', `Tamamlandı — ${passed}✓ ${failed}✗ ${warnings}⚠`, `Toplam: ${dur}s`);
        this.runs.push({
            id: 'RUN-' + Date.now().toString(36).toUpperCase(), date: new Date().toISOString(), total: ids.length, passed, failed, warnings, duration: dur,
            scenarioResults: ids.map(id => { const s = this.scenarios.find(x => x.id === id); return { id, code: s.code, name: s.name, status: s.status }; })
        });
        this.save(); this.updateStatusBar();
        document.getElementById('progressText').textContent = `${ids.length} / ${ids.length}`;
        this.toast(`Test tamamlandı: ${passed}✓ ${failed}✗ ${warnings}⚠`, failed > 0 ? 'error' : warnings > 0 ? 'warning' : 'success');
    }

    async simulate(sc, log) {
        const t0 = Date.now(); let status = 'PASS', message = '';
        for (let i = 0; i < sc.steps.length; i++) {
            const step = sc.steps[i]; await this.delay(250 + Math.random() * 600);
            const r = Math.random();
            if (r < 0.07) { status = 'FAIL'; message = `Adım ${i + 1} hata: ${step.action}`; this.addLog(log, 'fail', '✗', `  ${i + 1}. ${step.action}`, `HATA — ${step.expected}`); break; }
            else if (r < 0.14) { if (status !== 'FAIL') status = 'WARNING'; message = `Adım ${i + 1} uyarı: ${step.action}`; this.addLog(log, 'warning', '⚠', `  ${i + 1}. ${step.action}`, `UYARI — Performans`); }
            else this.addLog(log, 'pass', '✓', `  ${i + 1}. ${step.action}`, `OK`);
        }
        return { status, duration: ((Date.now() - t0) / 1000).toFixed(1), message };
    }
    addLog(c, type, icon, msg, detail) {
        const t = new Date(), ts = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
        const d = document.createElement('div'); d.className = `exec-log-entry ${type}`;
        d.innerHTML = `<span class="log-time">${ts}</span><span class="log-icon">${icon}</span><div class="log-content"><div class="log-message">${msg}</div>${detail ? `<div class="log-detail">${detail}</div>` : ''}</div>`;
        c.appendChild(d); c.scrollTop = c.scrollHeight;
    }

    // ─── REPORTS ───
    bindReports() { document.getElementById('btnExportReport').onclick = () => this.exportReport(); }
    renderReports() {
        const body = document.getElementById('reportTableBody'), runs = [...this.runs].reverse();
        if (!runs.length) { body.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:24px">Henüz rapor yok</td></tr>'; return; }
        body.innerHTML = runs.map(r => {
            const c = r.failed > 0 ? 'fail' : r.warnings > 0 ? 'warning' : 'pass';
            return `<tr><td style="font-family:'JetBrains Mono',monospace;font-size:11px">${r.id}</td><td>${this.fmtDate(r.date)}</td><td>Testo</td><td>${r.total}</td>
        <td style="color:var(--green)">${r.passed}</td><td style="color:var(--red)">${r.failed}</td><td style="color:var(--amber)">${r.warnings}</td>
        <td>${r.duration}s</td><td><span class="status-tag ${c}"><span class="status-tag-dot"></span>${c === 'pass' ? 'Geçti' : c === 'fail' ? 'Kaldı' : 'Uyarılı'}</span></td>
        <td><button class="btn btn-xs btn-ghost" onclick="app.showRunDetail('${r.id}')">Detay</button></td></tr>`;
        }).join('');
    }
    showRunDetail(id) {
        const r = this.runs.find(x => x.id === id); if (!r) return;
        document.getElementById('reportModalTitle').textContent = `Çalıştırma: ${r.id}`;
        document.getElementById('reportModalBody').innerHTML = `<div class="report-detail-grid">
      <div class="report-detail-kpis"><div class="rd-kpi"><div class="rd-kpi-value">${r.total}</div><div class="rd-kpi-label">Toplam</div></div>
        <div class="rd-kpi"><div class="rd-kpi-value pass-color">${r.passed}</div><div class="rd-kpi-label">Başarılı</div></div>
        <div class="rd-kpi"><div class="rd-kpi-value fail-color">${r.failed}</div><div class="rd-kpi-label">Başarısız</div></div>
        <div class="rd-kpi"><div class="rd-kpi-value warn-color">${r.warnings}</div><div class="rd-kpi-label">Uyarı</div></div></div>
      <div><h3 style="font-size:14px;margin-bottom:12px">Senaryo Sonuçları</h3>
      ${(r.scenarioResults || []).map(sr => {
            const c = sr.status === 'PASS' ? 'pass' : sr.status === 'FAIL' ? 'fail' : 'warning';
            return `<div class="report-step-detail ${c}"><h4>${sr.name}</h4><p>${sr.code}</p>
          <div class="step-result-msg">${sr.status === 'PASS' ? '✓ Başarılı' : sr.status === 'FAIL' ? '✗ Başarısız' : '⚠ Uyarı'}</div></div>`;
        }).join('')}</div></div>`;
        document.getElementById('reportDetailModal').style.display = 'flex';
    }
    exportReport() {
        const blob = new Blob([JSON.stringify({ exportDate: new Date().toISOString(), scenarios: this.scenarios, runs: this.runs }, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `testo-report-${new Date().toISOString().slice(0, 10)}.json`; a.click();
        this.toast('Rapor indirildi', 'success');
    }

    // ─── SETTINGS ───
    bindSettings() {
        document.getElementById('btnSaveSettings').onclick = () => {
            this.settings = {
                apiUrl: document.getElementById('settingApiUrl').value, mode: document.getElementById('settingMode').value,
                timeout: parseInt(document.getElementById('settingTimeout').value), parallel: parseInt(document.getElementById('settingParallel').value)
            };
            this.save(); this.toast('Ayarlar kaydedildi', 'success'); this.updateStatusBar();
        };
        document.getElementById('btnExportScenarios').onclick = () => {
            const b = new Blob([JSON.stringify(this.scenarios, null, 2)], { type: 'application/json' }); const a = document.createElement('a');
            a.href = URL.createObjectURL(b); a.download = `testo-scenarios-${new Date().toISOString().slice(0, 10)}.json`; a.click(); this.toast('Dışa aktarıldı', 'success');
        };
        document.getElementById('btnImportScenarios').onclick = () => document.getElementById('importFileInput').click();
        document.getElementById('importFileInput').onchange = (e) => {
            const f = e.target.files[0]; if (!f) return; const r = new FileReader();
            r.onload = (ev) => { try { const d = JSON.parse(ev.target.result); if (Array.isArray(d)) this.scenarios = [...this.scenarios, ...d]; this.save(); this.renderScenarios(); this.toast('İçe aktarıldı', 'success'); } catch (e) { this.toast('Geçersiz dosya', 'error'); } }; r.readAsText(f);
        };
        document.getElementById('btnResetAll').onclick = () => {
            if (!confirm('Tüm veriler silinecek. Emin misiniz?')) return; localStorage.removeItem(STORAGE_KEY);
            this.scenarios = getDefaultScenarios(); this.runs = []; this.save(); this.updateDashboard(); this.renderScenarios(); this.renderExecutionChecklist(); this.renderReports(); this.toast('Sıfırlandı', 'warning');
        };
    }

    // ─── HELPERS ───
    closeModal(id) { document.getElementById(id).style.display = 'none'; }
    delay(ms) { return new Promise(r => setTimeout(r, ms)); }
    pLabel(p) { return { critical: 'Kritik', high: 'Yüksek', medium: 'Orta', low: 'Düşük' }[p] || p; }
    fmtDate(d) { if (!d) return '—'; const dt = new Date(d); return `${dt.toLocaleDateString('tr-TR')} ${dt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`; }
    fmtElapsed(ms) { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
    updateStatusBar() {
        document.getElementById('statusConnection').textContent = this.settings.mode === 'mock' ? 'Mock Mode Aktif' : 'Canlı Redigo API';
        const lr = this.runs.length ? this.runs[this.runs.length - 1] : null;
        document.getElementById('statusLastRun').textContent = lr ? `Son: ${this.fmtDate(lr.date)}` : 'Son Çalıştırma: —';
        document.getElementById('statusPassFail').textContent = `Başarı: ${this.scenarios.filter(s => s.status === 'PASS').length} / Hata: ${this.scenarios.filter(s => s.status === 'FAIL').length}`;
    }
    updateClock() { document.getElementById('statusTime').textContent = new Date().toLocaleTimeString('tr-TR'); }
    toast(msg, type = 'info') {
        const c = document.getElementById('toastContainer'), icons = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' };
        const d = document.createElement('div'); d.className = `toast ${type}`;
        d.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span class="toast-message">${msg}</span><button class="toast-close" onclick="this.parentElement.remove()">×</button>`;
        c.appendChild(d); setTimeout(() => { if (d.parentElement) d.remove(); }, 4000);
    }
}

const app = new TestoApp();
