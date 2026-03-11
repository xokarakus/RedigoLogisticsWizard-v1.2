/**
 * Work Order Status Constants
 * Tek kaynak — tüm route/handler dosyalari buradan import eder.
 */

// Islem devam ediyor — tekrar gonderme, ama düzenlenebilir
const PROCESSING_STATUSES = ['RECEIVED', 'SENT_TO_WMS', 'IN_PROGRESS', 'PARTIALLY_DONE'];

// Kapali — tamamlandi/iptal, tekrar acilamaz, duzenlenemez
const CLOSED_STATUSES = ['COMPLETED', 'PGI_POSTED', 'GR_POSTED', 'CANCELLED'];

// Hata durumlari — tekrar denenebilir
const ERROR_STATUSES = ['DISPATCH_FAILED', 'FAILED'];

// Inbound duplicate check: bu durumlardaki is emirleri tekrar kabul edilmez
const ACTIVE_STATUSES = [...PROCESSING_STATUSES, ...CLOSED_STATUSES];

module.exports = {
  PROCESSING_STATUSES,
  CLOSED_STATUSES,
  ERROR_STATUSES,
  ACTIVE_STATUSES
};
