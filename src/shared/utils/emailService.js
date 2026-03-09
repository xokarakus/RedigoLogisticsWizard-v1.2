/**
 * Email Service — Nodemailer SMTP
 *
 * Sifre sifirlama ve hesap kilitleme bildirimleri icin.
 * Oncelik: system_settings tablosundaki tenant bazli ayarlar.
 * Fallback: .env'deki SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, APP_URL
 */
const logger = require('./logger');

// Cache: tenant_id -> transporter
const transporterCache = {};

/**
 * DB'den tenant'a ait SMTP ayarlarini oku.
 */
async function getSmtpConfig(tenantId) {
  try {
    const { query } = require('../database/pool');
    const { rows } = await query(
      'SELECT value FROM system_settings WHERE tenant_id = $1 AND key = $2',
      [tenantId, 'email']
    );
    if (rows.length > 0 && rows[0].value) {
      return rows[0].value;
    }
  } catch (_) { /* DB yok veya hata — fallback .env */ }
  return null;
}

/**
 * Transporter olustur (DB veya .env ayarlariyla).
 */
async function getTransporter(tenantId) {
  // Cache kontrol
  const cacheKey = tenantId || '_global';
  if (transporterCache[cacheKey]) return transporterCache[cacheKey];

  try {
    const nodemailer = require('nodemailer');
    let cfg = null;

    // DB'den tenant bazli ayar
    if (tenantId) {
      cfg = await getSmtpConfig(tenantId);
    }

    let transportOpts;
    if (cfg && cfg.smtp_host) {
      transportOpts = {
        host: cfg.smtp_host,
        port: parseInt(cfg.smtp_port || '587', 10),
        secure: cfg.smtp_secure === true || cfg.smtp_secure === 'true',
        auth: cfg.smtp_user ? { user: cfg.smtp_user, pass: cfg.smtp_pass } : undefined
      };
    } else if (process.env.SMTP_HOST) {
      transportOpts = {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
      };
    } else {
      return null;
    }

    const t = nodemailer.createTransport(transportOpts);
    transporterCache[cacheKey] = t;
    return t;
  } catch (err) {
    logger.warn('Nodemailer not available', { error: err.message });
    return null;
  }
}

/**
 * Transporter cache temizle (ayar degistiginde).
 */
function resetTransporter(tenantId) {
  if (tenantId) {
    delete transporterCache[tenantId];
  } else {
    Object.keys(transporterCache).forEach(k => delete transporterCache[k]);
  }
}

/**
 * From adresini al.
 */
async function getFromAddress(tenantId) {
  if (tenantId) {
    const cfg = await getSmtpConfig(tenantId);
    if (cfg && cfg.smtp_from) return cfg.smtp_from;
  }
  return process.env.SMTP_FROM || 'noreply@redigodigital.com';
}

/**
 * APP_URL al.
 */
async function getAppUrl(tenantId) {
  if (tenantId) {
    const cfg = await getSmtpConfig(tenantId);
    if (cfg && cfg.app_url) return cfg.app_url;
  }
  return process.env.APP_URL || 'http://localhost:3000';
}

/**
 * Genel email gonderme fonksiyonu.
 */
async function sendEmail(to, subject, html, tenantId) {
  const t = await getTransporter(tenantId);
  if (!t) {
    logger.warn('Email skipped — SMTP not configured', { to, subject });
    return false;
  }
  try {
    const from = await getFromAddress(tenantId);
    await t.sendMail({ from, to, subject, html });
    logger.info('Email sent', { to, subject });
    return true;
  } catch (err) {
    logger.error('Email send failed', { to, subject, error: err.message });
    return false;
  }
}

/* ═══════════════════════════════════════════
   Kurumsal E-posta Sablonlari
   ═══════════════════════════════════════════ */

function baseTemplate(content) {
  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;padding:40px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0854A0 0%,#1070CA 100%);padding:28px 40px;">
            <table role="presentation" width="100%"><tr>
              <td>
                <h1 style="margin:0;font-size:22px;color:#ffffff;font-weight:600;">Redigo Logistics</h1>
                <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Entegrasyon Platformu</p>
              </td>
              <td align="right" style="vertical-align:middle;">
                <div style="width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,0.15);text-align:center;line-height:42px;font-size:20px;">&#9993;</div>
              </td>
            </tr></table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 28px;">
            ${content}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#f8f9fa;padding:20px 40px;border-top:1px solid #e9ecef;">
            <table role="presentation" width="100%"><tr>
              <td style="font-size:11px;color:#8c8c8c;line-height:1.5;">
                Bu e-posta <strong>Redigo Logistics Cockpit</strong> taraf\u0131ndan otomatik g\u00f6nderilmi\u015ftir.<br>
                L\u00fctfen bu e-postay\u0131 yan\u0131tlamay\u0131n\u0131z.
              </td>
              <td align="right" style="font-size:11px;color:#8c8c8c;">
                &copy; ${new Date().getFullYear()} Redigo Digital
              </td>
            </tr></table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Sifre sifirlama e-postasi gonder.
 */
async function sendPasswordReset(user, resetToken) {
  const appUrl = await getAppUrl(user.tenant_id);
  const resetLink = appUrl + '/reset-password.html?token=' + resetToken;
  const displayName = user.display_name || user.username;
  const subject = 'Redigo Logistics \u2014 \u015eifre S\u0131f\u0131rlama';

  const content = `
    <p style="margin:0 0 6px;font-size:14px;color:#666;">Merhaba,</p>
    <h2 style="margin:0 0 20px;font-size:20px;color:#1a1a1a;">${displayName}</h2>

    <p style="font-size:14px;color:#444;line-height:1.6;">
      Hesab\u0131n\u0131z i\u00e7in bir \u015fifre s\u0131f\u0131rlama talebi al\u0131nd\u0131.
      A\u015fa\u011f\u0131daki butona t\u0131klayarak yeni \u015fifrenizi belirleyebilirsiniz.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
      <tr><td>
        <a href="${resetLink}" style="display:inline-block;background:linear-gradient(135deg,#0854A0,#1070CA);color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:6px;font-size:15px;font-weight:600;letter-spacing:0.3px;box-shadow:0 3px 12px rgba(8,84,160,0.3);">
          \u015eifre S\u0131f\u0131rla
        </a>
      </td></tr>
    </table>

    <div style="background:#f8f9fa;border-left:3px solid #0854A0;padding:12px 16px;border-radius:4px;margin:20px 0;">
      <p style="margin:0;font-size:12px;color:#666;">
        <strong>Dikkat:</strong> Bu ba\u011flant\u0131 <strong>1 saat</strong> ge\u00e7erlidir.
        S\u00fcresi dolduktan sonra yeni bir talep olu\u015fturman\u0131z gerekecektir.
      </p>
    </div>

    <p style="font-size:13px;color:#888;line-height:1.5;">
      E\u011fer bu talebi siz yapmad\u0131ysan\u0131z, bu e-postay\u0131 g\u00f6rmezden gelebilirsiniz.
      Hesab\u0131n\u0131z g\u00fcvende kalacakt\u0131r.
    </p>

    <p style="font-size:12px;color:#aaa;margin-top:20px;">
      Ba\u011flant\u0131 \u00e7al\u0131\u015fm\u0131yorsa a\u015fa\u011f\u0131daki URL'yi taray\u0131c\u0131n\u0131za yap\u0131\u015ft\u0131r\u0131n:<br>
      <a href="${resetLink}" style="color:#0854A0;word-break:break-all;font-size:11px;">${resetLink}</a>
    </p>
  `;

  return sendEmail(user.email, subject, baseTemplate(content), user.tenant_id);
}

/**
 * Hesap kilitlendi bildirimi gonder.
 */
async function sendAccountLocked(user) {
  if (!user.email) return false;
  const subject = 'Redigo Logistics \u2014 Hesab\u0131n\u0131z Kilitlendi';
  const displayName = user.display_name || user.username;

  const content = `
    <p style="margin:0 0 6px;font-size:14px;color:#666;">Merhaba,</p>
    <h2 style="margin:0 0 20px;font-size:20px;color:#1a1a1a;">${displayName}</h2>

    <div style="background:#fff3f3;border-left:3px solid #cc0000;padding:14px 16px;border-radius:4px;margin:16px 0;">
      <p style="margin:0;font-size:14px;color:#cc0000;font-weight:600;">
        Hesab\u0131n\u0131z Kilitlendi
      </p>
      <p style="margin:8px 0 0;font-size:13px;color:#666;">
        Ard\u0131 ard\u0131na 3 ba\u015far\u0131s\u0131z giri\u015f denemesi tespit edildi.
        Hesab\u0131n\u0131z g\u00fcvenlik amac\u0131yla <strong>15 dakika</strong> s\u00fcreyle kilitlenmi\u015ftir.
      </p>
    </div>

    <p style="font-size:14px;color:#444;line-height:1.6;">
      E\u011fer bu denemeleri siz yapmad\u0131ysan\u0131z, l\u00fctfen y\u00f6neticinizle ileti\u015fime ge\u00e7in.
    </p>
  `;

  return sendEmail(user.email, subject, baseTemplate(content), user.tenant_id);
}

module.exports = { sendEmail, sendPasswordReset, sendAccountLocked, resetTransporter };
