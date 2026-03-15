const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Redigo Logistics Cockpit API',
      version: '1.2.0',
      description: 'SAP ↔ 3PL/WMS entegrasyon platformu. Multi-tenant, RBAC korumalı REST API.',
      contact: { name: 'Redigo Engineering' }
    },
    servers: [
      { url: '/api/v1', description: 'API v1' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'POST /auth/login ile alınan JWT token'
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'Webhook endpoint\'leri için API key'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            correlationId: { type: 'string', format: 'uuid' },
            details: { type: 'array', items: { type: 'object' } }
          }
        },
        Pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            limit: { type: 'integer' },
            offset: { type: 'integer' }
          }
        },
        WorkOrder: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            sap_delivery_no: { type: 'string', example: '80012345' },
            delivery_type: { type: 'string', enum: ['OUTBOUND', 'INBOUND', 'RETURN', 'TRANSFER'] },
            warehouse_code: { type: 'string', example: 'WH01' },
            status: { type: 'string', enum: ['RECEIVED', 'SENT_TO_WMS', 'IN_PROGRESS', 'PICKING_COMPLETE', 'PARTIALLY_DONE', 'COMPLETED', 'DISPATCH_FAILED', 'ERROR'] },
            ship_to_party: { type: 'string' },
            sold_to_party: { type: 'string' },
            received_at: { type: 'string', format: 'date-time' },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        WorkOrderLine: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            work_order_id: { type: 'string', format: 'uuid' },
            material_no: { type: 'string' },
            description: { type: 'string' },
            requested_qty: { type: 'number' },
            confirmed_qty: { type: 'number' },
            uom: { type: 'string' }
          }
        },
        Transaction: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            work_order_id: { type: 'string', format: 'uuid' },
            correlation_id: { type: 'string', format: 'uuid' },
            direction: { type: 'string', enum: ['SAP_TO_WMS', 'WMS_TO_SAP', 'INTERNAL'] },
            event_type: { type: 'string' },
            status: { type: 'string', enum: ['SUCCESS', 'FAILED', 'PENDING'] },
            payload: { type: 'object' },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        Material: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            sap_material_no: { type: 'string', maxLength: 18 },
            description: { type: 'string' },
            material_group: { type: 'string' },
            base_uom: { type: 'string' },
            gross_weight: { type: 'number' },
            net_weight: { type: 'number' }
          }
        },
        BusinessPartner: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            sap_partner_no: { type: 'string' },
            name: { type: 'string' },
            partner_type: { type: 'string', enum: ['CUSTOMER', 'VENDOR'] },
            city: { type: 'string' },
            country: { type: 'string' }
          }
        },
        ScheduledJob: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            job_type: { type: 'string', enum: ['FETCH_FROM_SAP', 'SEND_TO_3PL', 'POST_GOODS_ISSUE', 'POST_GOODS_RECEIPT', 'QUERY_STATUS', 'RECONCILIATION', 'CLEANUP_LOGS'] },
            schedule_type: { type: 'string', enum: ['PERIODIC', 'ONE_TIME'] },
            cron_expression: { type: 'string', example: '*/30 * * * *' },
            is_active: { type: 'boolean' },
            config: { type: 'object' },
            last_run_status: { type: 'string' },
            next_run_at: { type: 'string', format: 'date-time' }
          }
        },
        DashboardKPIs: {
          type: 'object',
          properties: {
            totalOrders: { type: 'integer' },
            inProgress: { type: 'integer' },
            completedToday: { type: 'integer' },
            failedCount: { type: 'integer' },
            todayIngest: { type: 'integer' },
            pendingSAP: { type: 'integer' },
            dlqCount: { type: 'integer' },
            avgLatency: { type: 'number' }
          }
        },
        Warehouse: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            code: { type: 'string' },
            name: { type: 'string' },
            provider_type: { type: 'string' },
            is_active: { type: 'boolean' }
          }
        }
      },
      parameters: {
        limitParam: { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 500 } },
        offsetParam: { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } }
      }
    },
    security: [{ bearerAuth: [] }],

    // ── Paths ──
    paths: {
      // ═══ Auth ═══
      '/auth/setup-status': {
        get: {
          tags: ['Auth'], summary: 'Sistem kurulum durumu', security: [],
          responses: { 200: { description: 'Setup gerekli mi', content: { 'application/json': { schema: { type: 'object', properties: { needsSetup: { type: 'boolean' } } } } } } }
        }
      },
      '/auth/setup': {
        post: {
          tags: ['Auth'], summary: 'Ilk sistem kurulumu (super admin olusturma)', security: [],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password', 'full_name', 'tenant_name'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 8 }, full_name: { type: 'string' }, tenant_name: { type: 'string' } } } } } },
          responses: { 201: { description: 'Kurulum tamamlandi' }, 400: { description: 'Validasyon hatasi' } }
        }
      },
      '/auth/login': {
        post: {
          tags: ['Auth'], summary: 'Kullanici girisi', security: [],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } } } } } },
          responses: { 200: { description: 'JWT + refresh token', content: { 'application/json': { schema: { type: 'object', properties: { token: { type: 'string' }, refreshToken: { type: 'string' }, user: { type: 'object' } } } } } }, 401: { description: 'Gecersiz kimlik bilgileri' }, 423: { description: 'Hesap kilitli' } }
        }
      },
      '/auth/refresh': {
        post: {
          tags: ['Auth'], summary: 'Access token yenile', security: [],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } } } } },
          responses: { 200: { description: 'Yeni JWT + refresh token' }, 401: { description: 'Gecersiz refresh token' } }
        }
      },
      '/auth/logout': {
        post: {
          tags: ['Auth'], summary: 'Cikis (tum refresh token\'lari iptal et)',
          responses: { 200: { description: 'Basarili' } }
        }
      },
      '/auth/me': {
        get: {
          tags: ['Auth'], summary: 'Mevcut kullanici bilgileri',
          responses: { 200: { description: 'Kullanici profili' } }
        }
      },
      '/auth/password': {
        put: {
          tags: ['Auth'], summary: 'Sifre degistir',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['current_password', 'new_password'], properties: { current_password: { type: 'string' }, new_password: { type: 'string', minLength: 8 } } } } } },
          responses: { 200: { description: 'Sifre degistirildi' } }
        }
      },
      '/auth/tenants': {
        get: {
          tags: ['Auth - Tenant Yonetimi'], summary: 'Tenant listesi (Super Admin)',
          responses: { 200: { description: 'Tenant listesi' } }
        },
        post: {
          tags: ['Auth - Tenant Yonetimi'], summary: 'Yeni tenant olustur (Super Admin)',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, code: { type: 'string' }, is_active: { type: 'boolean' } } } } } },
          responses: { 201: { description: 'Tenant olusturuldu' } }
        }
      },
      '/auth/tenants/{id}': {
        put: {
          tags: ['Auth - Tenant Yonetimi'], summary: 'Tenant guncelle (Super Admin)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Guncellendi' } }
        },
        delete: {
          tags: ['Auth - Tenant Yonetimi'], summary: 'Tenant sil (Super Admin)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Silindi' } }
        }
      },
      '/auth/users': {
        get: {
          tags: ['Auth - Kullanici Yonetimi'], summary: 'Kullanici listesi (Tenant Admin)',
          responses: { 200: { description: 'Kullanici listesi' } }
        },
        post: {
          tags: ['Auth - Kullanici Yonetimi'], summary: 'Yeni kullanici olustur (Tenant Admin)',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password', 'full_name', 'role_id'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 8 }, full_name: { type: 'string' }, role_id: { type: 'string', format: 'uuid' } } } } } },
          responses: { 201: { description: 'Kullanici olusturuldu' } }
        }
      },
      '/auth/users/{id}': {
        put: {
          tags: ['Auth - Kullanici Yonetimi'], summary: 'Kullanici guncelle (Tenant Admin)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Guncellendi' } }
        }
      },
      '/auth/roles': {
        get: {
          tags: ['Auth - Rol Yonetimi'], summary: 'Rol listesi',
          responses: { 200: { description: 'Rol listesi' } }
        },
        post: {
          tags: ['Auth - Rol Yonetimi'], summary: 'Yeni rol olustur',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'permissions'], properties: { name: { type: 'string' }, description: { type: 'string' }, permissions: { type: 'array', items: { type: 'string' } } } } } } },
          responses: { 201: { description: 'Rol olusturuldu' } }
        }
      },
      '/auth/impersonate': {
        post: {
          tags: ['Auth'], summary: 'Kullanici taklit et (Super Admin)',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['tenant_id'], properties: { tenant_id: { type: 'string', format: 'uuid' } } } } } },
          responses: { 200: { description: 'Impersonation token' } }
        }
      },

      // ═══ Work Orders ═══
      '/work-orders': {
        get: {
          tags: ['Is Emirleri'], summary: 'Is emri listesi',
          parameters: [
            { $ref: '#/components/parameters/limitParam' },
            { $ref: '#/components/parameters/offsetParam' },
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'warehouse_code', in: 'query', schema: { type: 'string' } },
            { name: 'search', in: 'query', schema: { type: 'string' } }
          ],
          responses: { 200: { description: 'Is emri listesi', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/WorkOrder' } }, total: { type: 'integer' }, limit: { type: 'integer' }, offset: { type: 'integer' } } } } } } }
        }
      },
      '/work-orders/{id}': {
        get: {
          tags: ['Is Emirleri'], summary: 'Is emri detayi',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Is emri + satirlar', content: { 'application/json': { schema: { type: 'object', properties: { order: { $ref: '#/components/schemas/WorkOrder' }, lines: { type: 'array', items: { $ref: '#/components/schemas/WorkOrderLine' } } } } } } }, 404: { description: 'Bulunamadi' } }
        },
        put: {
          tags: ['Is Emirleri'], summary: 'Is emri guncelle',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string' }, notes: { type: 'string' } } } } } },
          responses: { 200: { description: 'Guncellendi' } }
        }
      },
      '/work-orders/ingest': {
        post: {
          tags: ['Is Emirleri'], summary: 'SAP\'den teslimat al (ingest)',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['delivery_no'], properties: { delivery_no: { type: 'string' }, delivery_type: { type: 'string' }, items: { type: 'array', items: { type: 'object' } } } } } } },
          responses: { 201: { description: 'Is emri olusturuldu' } }
        }
      },

      // ═══ Dashboard ═══
      '/dashboard/kpis': {
        get: {
          tags: ['Dashboard'], summary: 'Dashboard KPI\'lari',
          responses: { 200: { description: 'KPI degerleri', content: { 'application/json': { schema: { $ref: '#/components/schemas/DashboardKPIs' } } } } }
        }
      },

      // ═══ Transactions ═══
      '/transactions': {
        get: {
          tags: ['Transaction Log'], summary: 'Transaction listesi',
          parameters: [
            { $ref: '#/components/parameters/limitParam' },
            { $ref: '#/components/parameters/offsetParam' },
            { name: 'direction', in: 'query', schema: { type: 'string', enum: ['SAP_TO_WMS', 'WMS_TO_SAP', 'INTERNAL'] } },
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'search', in: 'query', schema: { type: 'string' } }
          ],
          responses: { 200: { description: 'Transaction listesi', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Transaction' } }, total: { type: 'integer' } } } } } } }
        }
      },

      // ═══ Trigger ═══
      '/trigger/fetch-from-sap': {
        post: {
          tags: ['Trigger'], summary: 'SAP\'den teslimat verisi cek',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { delivery_no: { type: 'string' }, delivery_type: { type: 'string' } } } } } },
          responses: { 200: { description: 'SAP verisi alindi' } }
        }
      },
      '/trigger/send-to-3pl': {
        post: {
          tags: ['Trigger'], summary: 'Is emrini 3PL/WMS\'e gonder',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { delivery_no: { type: 'string' } } } } } },
          responses: { 200: { description: 'WMS\'e gonderildi' } }
        }
      },
      '/trigger/query-status': {
        post: {
          tags: ['Trigger'], summary: '3PL siparis durumu sorgula',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { delivery_no: { type: 'string' } } } } } },
          responses: { 200: { description: 'Durum bilgisi' } }
        }
      },

      // ═══ Goods Movement ═══
      '/goods-movement/post-pgi': {
        post: {
          tags: ['Mal Hareketi'], summary: 'Post Goods Issue (PGI) — SAP\'de mal cikisi',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['delivery_no'], properties: { delivery_no: { type: 'string' }, movement_type: { type: 'string', default: '601' } } } } } },
          responses: { 200: { description: 'PGI basarili' }, 400: { description: 'Hata' } }
        }
      },
      '/goods-movement/post-gr': {
        post: {
          tags: ['Mal Hareketi'], summary: 'Post Goods Receipt (GR) — SAP\'de mal girisi',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['delivery_no'], properties: { delivery_no: { type: 'string' }, movement_type: { type: 'string', default: '101' } } } } } },
          responses: { 200: { description: 'GR basarili' } }
        }
      },

      // ═══ Master Data ═══
      '/master-data/materials': {
        get: {
          tags: ['Ana Veri'], summary: 'Malzeme listesi',
          parameters: [
            { $ref: '#/components/parameters/limitParam' },
            { $ref: '#/components/parameters/offsetParam' },
            { name: 'search', in: 'query', schema: { type: 'string' } }
          ],
          responses: { 200: { description: 'Malzeme listesi', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Material' } }, total: { type: 'integer' } } } } } } }
        },
        post: {
          tags: ['Ana Veri'], summary: 'Malzeme olustur (Admin)',
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Material' } } } },
          responses: { 201: { description: 'Olusturuldu' } }
        }
      },
      '/master-data/materials/{id}': {
        get: {
          tags: ['Ana Veri'], summary: 'Malzeme detayi',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Malzeme bilgisi' } }
        },
        put: {
          tags: ['Ana Veri'], summary: 'Malzeme guncelle (Admin)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Guncellendi' } }
        },
        delete: {
          tags: ['Ana Veri'], summary: 'Malzeme sil (Admin)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Silindi' } }
        }
      },
      '/master-data/partners': {
        get: {
          tags: ['Ana Veri'], summary: 'Is ortagi listesi',
          parameters: [
            { $ref: '#/components/parameters/limitParam' },
            { $ref: '#/components/parameters/offsetParam' },
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'type', in: 'query', schema: { type: 'string', enum: ['ALL', 'CUSTOMER', 'VENDOR'] } }
          ],
          responses: { 200: { description: 'Partner listesi', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/BusinessPartner' } }, total: { type: 'integer' } } } } } } }
        },
        post: {
          tags: ['Ana Veri'], summary: 'Is ortagi olustur (Admin)',
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/BusinessPartner' } } } },
          responses: { 201: { description: 'Olusturuldu' } }
        }
      },
      '/master-data/dispatch': {
        post: {
          tags: ['Ana Veri'], summary: 'Ana veriyi 3PL\'e gonder (Admin)',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['type', 'mapping_id'], properties: { type: { type: 'string', enum: ['materials', 'partners'] }, ids: { type: 'array', items: { type: 'string', format: 'uuid' } }, mapping_id: { type: 'string', format: 'uuid' } } } } } },
          responses: { 200: { description: 'Gonderim sonucu' } }
        }
      },

      // ═══ Scheduled Jobs ═══
      '/scheduled-jobs': {
        get: {
          tags: ['Zamanli Gorevler'], summary: 'Zamanli gorev listesi',
          parameters: [{ $ref: '#/components/parameters/limitParam' }, { $ref: '#/components/parameters/offsetParam' }],
          responses: { 200: { description: 'Gorev listesi', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/ScheduledJob' } } } } } } } }
        },
        post: {
          tags: ['Zamanli Gorevler'], summary: 'Yeni zamanli gorev olustur',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'job_type', 'cron_expression'], properties: { name: { type: 'string' }, job_type: { type: 'string', enum: ['FETCH_FROM_SAP', 'SEND_TO_3PL', 'POST_GOODS_ISSUE', 'POST_GOODS_RECEIPT', 'QUERY_STATUS', 'RECONCILIATION', 'CLEANUP_LOGS'] }, schedule_type: { type: 'string', enum: ['PERIODIC', 'ONE_TIME'] }, cron_expression: { type: 'string' }, config: { type: 'object' } } } } } },
          responses: { 201: { description: 'Olusturuldu' } }
        }
      },
      '/scheduled-jobs/{id}': {
        get: {
          tags: ['Zamanli Gorevler'], summary: 'Gorev detayi',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Gorev bilgisi' } }
        },
        put: {
          tags: ['Zamanli Gorevler'], summary: 'Gorev guncelle',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Guncellendi' } }
        },
        delete: {
          tags: ['Zamanli Gorevler'], summary: 'Gorev sil',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Silindi' } }
        }
      },
      '/scheduled-jobs/{id}/run': {
        post: {
          tags: ['Zamanli Gorevler'], summary: 'Gorevi manuel calistir',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Calistirildi' } }
        }
      },
      '/scheduled-jobs/{id}/toggle': {
        post: {
          tags: ['Zamanli Gorevler'], summary: 'Gorevi aktif/pasif yap',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Durum degistirildi' } }
        }
      },

      // ═══ Config ═══
      '/config/warehouses': {
        get: {
          tags: ['Konfigürasyon'], summary: 'Depo listesi',
          responses: { 200: { description: 'Depo listesi', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Warehouse' } } } } } } } }
        },
        post: {
          tags: ['Konfigürasyon'], summary: 'Yeni depo olustur (Admin)',
          responses: { 201: { description: 'Olusturuldu' } }
        }
      },
      '/config/mappings': {
        get: { tags: ['Konfigürasyon'], summary: 'Hareket esleme listesi', responses: { 200: { description: 'Esleme listesi' } } },
        post: { tags: ['Konfigürasyon'], summary: 'Yeni esleme olustur (Admin)', responses: { 201: { description: 'Olusturuldu' } } }
      },
      '/config/process-configs': {
        get: { tags: ['Konfigürasyon'], summary: 'Süreç konfigürasyonlari', responses: { 200: { description: 'Config listesi' } } },
        post: { tags: ['Konfigürasyon'], summary: 'Yeni süreç config (Admin)', responses: { 201: { description: 'Olusturuldu' } } }
      },
      '/config/process-types': {
        get: { tags: ['Konfigürasyon'], summary: 'Süreç tipleri', responses: { 200: { description: 'Tip listesi' } } },
        post: { tags: ['Konfigürasyon'], summary: 'Yeni süreç tipi (Admin)', responses: { 201: { description: 'Olusturuldu' } } }
      },
      '/config/field-mappings': {
        get: { tags: ['Konfigürasyon'], summary: 'Alan eslemeleri', responses: { 200: { description: 'Esleme listesi' } } },
        post: { tags: ['Konfigürasyon'], summary: 'Yeni alan eslemesi (Admin)', responses: { 201: { description: 'Olusturuldu' } } }
      },
      '/config/security-profiles': {
        get: { tags: ['Konfigürasyon'], summary: 'Güvenlik profilleri', responses: { 200: { description: 'Profil listesi' } } },
        post: { tags: ['Konfigürasyon'], summary: 'Yeni güvenlik profili (Admin)', responses: { 201: { description: 'Olusturuldu' } } }
      },
      '/config/settings/{key}': {
        get: {
          tags: ['Konfigürasyon'], summary: 'Sistem ayari oku (Admin)',
          parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Ayar degeri' } }
        },
        put: {
          tags: ['Konfigürasyon'], summary: 'Sistem ayari guncelle (Admin)',
          parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Guncellendi' } }
        }
      },

      // ═══ Reconciliation ═══
      '/reconciliation': {
        get: {
          tags: ['Mutabakat'], summary: 'Mutabakat rapor listesi',
          responses: { 200: { description: 'Rapor listesi' } }
        }
      },
      '/reconciliation/trigger': {
        post: {
          tags: ['Mutabakat'], summary: 'Manuel mutabakat calistir (Tenant Admin)',
          responses: { 200: { description: 'Mutabakat sonucu' } }
        }
      },

      // ═══ Queue ═══
      '/queue/stats': {
        get: {
          tags: ['Kuyruk'], summary: 'Kuyruk istatistikleri',
          responses: { 200: { description: 'Kuyruk durumu' } }
        }
      },
      '/queue/jobs': {
        get: {
          tags: ['Kuyruk'], summary: 'Kuyruk is listesi',
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'job_type', in: 'query', schema: { type: 'string' } },
            { $ref: '#/components/parameters/limitParam' },
            { $ref: '#/components/parameters/offsetParam' }
          ],
          responses: { 200: { description: 'Job listesi' } }
        }
      },
      '/queue/jobs/{id}/retry': {
        post: {
          tags: ['Kuyruk'], summary: 'Basarisiz job\'i yeniden dene',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Yeniden kuyruga eklendi' }, 404: { description: 'Job bulunamadi' } }
        }
      },

      // ═══ Webhooks ═══
      '/wms/confirmation': {
        post: {
          tags: ['Webhook'], summary: 'WMS onay bildirimi', security: [{ apiKeyAuth: [] }],
          description: 'WMS/3PL sisteminden gelen pick/receipt onay bilgisi. HMAC-SHA256 imza dogrulamasi gerektirir.',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
          responses: { 200: { description: 'Islendi' }, 401: { description: 'Gecersiz API key/imza' } }
        }
      },
      '/inbound/{path}': {
        post: {
          tags: ['Webhook'], summary: 'SAP inbound veri alimi', security: [{ apiKeyAuth: [] }],
          description: 'SAP sisteminden dinamik veri alimi. HMAC-SHA256 imza dogrulamasi gerektirir.',
          parameters: [{ name: 'path', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Islendi' }, 401: { description: 'Gecersiz API key/imza' } }
        }
      },

      // ═══ DB Cockpit (Super Admin) ═══
      '/db-cockpit/tables': {
        get: {
          tags: ['DB Cockpit'], summary: 'Tablo listesi + satir sayilari (Super Admin)',
          responses: { 200: { description: 'Tablo listesi' } }
        }
      },
      '/db-cockpit/tables/{name}/schema': {
        get: {
          tags: ['DB Cockpit'], summary: 'Tablo sema bilgisi (Super Admin)',
          parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Sutun + constraint bilgisi' } }
        }
      },
      '/db-cockpit/tables/{name}/data': {
        get: {
          tags: ['DB Cockpit'], summary: 'Sayfali tablo verisi (Super Admin)',
          parameters: [
            { name: 'name', in: 'path', required: true, schema: { type: 'string' } },
            { $ref: '#/components/parameters/limitParam' },
            { $ref: '#/components/parameters/offsetParam' },
            { name: 'sort', in: 'query', schema: { type: 'string' } },
            { name: 'order', in: 'query', schema: { type: 'string', enum: ['ASC', 'DESC'] } }
          ],
          responses: { 200: { description: 'Tablo verisi' } }
        }
      },
      '/db-cockpit/query': {
        post: {
          tags: ['DB Cockpit'], summary: 'Custom SELECT sorgusu calistir (Super Admin)',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['sql'], properties: { sql: { type: 'string', example: 'SELECT * FROM work_orders LIMIT 10' } } } } } },
          responses: { 200: { description: 'Sorgu sonucu' }, 400: { description: 'Gecersiz sorgu' } }
        }
      },
      '/db-cockpit/relationships': {
        get: {
          tags: ['DB Cockpit'], summary: 'FK iliskileri (Super Admin)',
          responses: { 200: { description: 'Foreign key listesi' } }
        }
      },

      // ═══ Inventory ═══
      '/inventory/mappings': {
        get: {
          tags: ['Envanter'], summary: 'Aktif hareket eslemeleri',
          responses: { 200: { description: 'Esleme listesi' } }
        }
      }
    },

    tags: [
      { name: 'Auth', description: 'Kimlik dogrulama ve yetkilendirme' },
      { name: 'Auth - Tenant Yonetimi', description: 'Multi-tenant yonetimi (Super Admin)' },
      { name: 'Auth - Kullanici Yonetimi', description: 'Kullanici CRUD (Tenant Admin)' },
      { name: 'Auth - Rol Yonetimi', description: 'RBAC rol yonetimi' },
      { name: 'Is Emirleri', description: 'SAP teslimat ↔ is emri yonetimi' },
      { name: 'Dashboard', description: 'Operasyonel KPI\'lar' },
      { name: 'Transaction Log', description: 'Entegrasyon islem kayitlari' },
      { name: 'Trigger', description: 'Manuel SAP/3PL islem tetikleyicileri' },
      { name: 'Mal Hareketi', description: 'SAP Goods Issue (PGI) / Goods Receipt (GR)' },
      { name: 'Ana Veri', description: 'Malzeme ve is ortagi yonetimi' },
      { name: 'Zamanli Gorevler', description: 'Cron tabanli zamanli gorevler' },
      { name: 'Konfigürasyon', description: 'Sistem ve entegrasyon konfigürasyonu' },
      { name: 'Mutabakat', description: 'SAP ↔ WMS mutabakat raporlari' },
      { name: 'Kuyruk', description: 'PostgreSQL SKIP LOCKED is kuyruğu' },
      { name: 'Webhook', description: 'Harici sistem webhook\'lari (HMAC korumali)' },
      { name: 'DB Cockpit', description: 'Veritabani yonetim paneli (Super Admin)' },
      { name: 'Envanter', description: 'Envanter hareket eslemeleri' }
    ]
  },
  apis: [] // inline paths kullaniyoruz
};

const swaggerSpec = swaggerJsdoc(options);

function setupSwagger(app) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Redigo API Docs'
  }));

  // JSON spec endpoint
  app.get('/api-docs.json', (req, res) => {
    res.json(swaggerSpec);
  });
}

module.exports = { setupSwagger, swaggerSpec };
