const SUPABASE_URL = 'https://ktakbzcnolmveujyurkj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0YWtiemNub2xtdmV1anl1cmtqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNDMxMzYsImV4cCI6MjA5OTYxOTEzNn0.dofeHYx3EYKPyude2sHLXVWwmSLJwYbEJws-5S1-blY';

// Aquí es donde colocarás tu URL cuando publiques tu Code.gs
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyJ-zYNxOia9J3oYSX-cQAccITvfKe83sR4DpYqtdbD9MK5cOCsXwS5NVO1brpjq4t1/exec';
const DRIVE_FOLDER_ID = '12A_-i9XhVSMfQKx9NQy-JzqEYJo7FJWv';

// Inicializar cliente Supabase (solo para operaciones de base de datos)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ==========================================================================
   HELPERS GLOBALES
   ========================================================================== */
function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
window.escapeHTML = escapeHTML;
window.escapeHtml = escapeHTML;

function formatTimeAgo(date) {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (!d || isNaN(d.getTime())) return '';
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'hace unos segundos';
    if (diffMin < 60) return `hace ${diffMin} min`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `hace ${diffHrs} h`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `hace ${diffDays} día${diffDays > 1 ? 's' : ''}`;
    return d.toLocaleDateString('es-PE', { day:'2-digit', month:'short' });
}

// Subida de archivos a Google Drive vía Apps Script
async function uploadFileToDrive(file, prefix = 'msg') {
    const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result);
        reader.readAsDataURL(file);
    });

    const safeName = (file.name || 'archivo').replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${prefix}_${Date.now()}_${safeName}`;

    try {
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'upload_image', data: base64, filename: filename })
        });

        await new Promise(r => setTimeout(r, 1400));
        const lookupResp = await fetch(`${APPS_SCRIPT_URL}?action=find_file&filename=${encodeURIComponent(filename)}`);
        const lookup = await lookupResp.json();
        if (lookup && lookup.status === 'success' && lookup.url) {
            return { url: lookup.url, name: file.name, type: file.type };
        }
    } catch (err) {
        console.warn('Error subiendo a Drive, usando DataURL fallback:', err);
    }
    return { url: base64, name: file.name, type: file.type };
}

// Helper para renderizar lista de archivos adjuntos en mensajes
function renderAttachmentsHTML(attachments) {
    if (!attachments || !Array.isArray(attachments) || attachments.length === 0) return '';
    
    return `
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;">
            ${attachments.map(att => {
                const isImg = (att.type && att.type.startsWith('image/')) || /\.(jpg|jpeg|png|gif|webp|svg)/i.test(att.name || att.url || '');
                const url = att.url || att;
                const name = att.name || 'Archivo adjunto';
                
                if (isImg) {
                    return `
                        <a href="${url}" target="_blank" rel="noopener noreferrer" style="display:block; border-radius:8px; overflow:hidden; border:1px solid rgba(0,0,0,0.08); transition:transform 0.15s; max-width:140px; max-height:110px; background:#f8fafc;">
                            <img src="${url}" alt="${escapeHTML(name)}" style="width:100%; height:100%; object-fit:cover; display:block;" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'80\\' height=\\'60\\' viewBox=\\'0 0 80 60\\'><rect fill=\\'%23f1f5f9\\' width=\\'80\\' height=\\'60\\'/><text fill=\\'%2394a3b8\\' font-size=\\'10\\' x=\\'50%\\' y=\\'50%\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\'>Imagen</text></svg>'">
                        </a>
                    `;
                } else {
                    return `
                        <a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:6px; background:#f8fafc; border:1px solid #e2e8f0; color:#1e293b; font-size:0.75rem; text-decoration:none; max-width:200px;">
                            <i class="fa-solid fa-paperclip" style="color:#64748b;"></i>
                            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(name)}</span>
                            <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.65rem; color:#94a3b8;"></i>
                        </a>
                    `;
                }
            }).join('')}
        </div>
    `;
}

/* ==========================================================================
   SISTEMA DE AUTENTICACIÓN PROPIO (Sin Supabase Auth)
   ========================================================================== */

// Hash de contraseña con SHA-256
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + '_omnihotel_salt_2026');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Iniciar sesión (via RPC seguro — no expone app_users)
async function appLogin(email, password) {
    const passwordHash = await hashPassword(password);
    
    const { data, error } = await supabaseClient
        .rpc('app_login', {
            p_email: email.toLowerCase().trim(),
            p_pass_hash: passwordHash
        });

    if (error || !data || !data.user) {
        return { user: null, error: (data && data.error) || 'Correo o contraseña incorrectos' };
    }

    const userData = data.user;

    // Si tiene 2FA activado, NO completar login aún
    if (userData.two_factor_enabled) {
        return { user: userData, error: null, requires2FA: true };
    }

    // Login directo (sin 2FA)
    const session = {
        id: userData.id,
        email: userData.email,
        full_name: userData.full_name,
        role: userData.role,
        hotel_id: userData.hotel_id,
        superadmin_level: userData.superadmin_level
    };
    localStorage.setItem('omnihotel_session', JSON.stringify(session));
    
    return { user: session, error: null, requires2FA: false };
}

// Generar y enviar código 2FA por email
async function generate2FACode(userId, userEmail, userName) {
    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 dígitos
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutos

    // Invalidar códigos anteriores
    await supabaseClient
        .from('two_factor_codes')
        .update({ used: true })
        .eq('user_id', userId)
        .eq('used', false);

    // Insertar nuevo código
    await supabaseClient
        .from('two_factor_codes')
        .insert([{ user_id: userId, code: code, expires_at: expiresAt }]);

    // Enviar email (con fallback si falla por cuota)
    let emailFailed = false;
    if (APPS_SCRIPT_URL && APPS_SCRIPT_URL !== 'LA_URL_DE_TU_SCRIPT_AQUI') {
        try {
            const saasName = getSaaSName();
            const saasColor = getSaaSPrimaryColor();
            const resp = await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'send_email',
                    to: userEmail,
                    subject: `${saasName} - Código de Verificación`,
                    body: `
                        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto;">
                            <div style="background: linear-gradient(135deg, ${saasColor}, #6366f1); padding: 1.75rem 1.5rem; border-radius: 16px 16px 0 0; text-align: center;">
                                <h1 style="color: white; margin: 0; font-size: 1.3rem;">${saasName}</h1>
                                <p style="color: rgba(255,255,255,0.85); margin: 0.25rem 0 0; font-size: 0.82rem;">Verificación en Dos Pasos</p>
                            </div>
                            <div style="background: white; padding: 1.75rem 1.5rem; border: 1px solid #e2e8f0; border-top: none; text-align: center;">
                                <p style="color: #334155; font-size: 0.92rem; margin: 0 0 0.5rem;">Hola <strong>${userName}</strong>,</p>
                                <p style="color: #64748b; font-size: 0.85rem; margin-bottom: 1.25rem;">Tu código de verificación es:</p>
                                <div style="background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 1.25rem; margin-bottom: 1.25rem;">
                                    <span style="font-size: 2.5rem; font-weight: 800; letter-spacing: 12px; color: #1e293b; font-family: 'Courier New', monospace;">${code}</span>
                                </div>
                                <p style="color: #94a3b8; font-size: 0.76rem;">⏰ Este código expira en <strong>5 minutos</strong>.<br>Si no solicitaste este código, ignora este email.</p>
                            </div>
                            <div style="background: #f8fafc; padding: 0.75rem 1.5rem; border-radius: 0 0 16px 16px; border: 1px solid #e2e8f0; border-top: none; text-align: center;">
                                <p style="color: #94a3b8; font-size: 0.7rem; margin: 0;">${saasName} &bull; Email automático</p>
                            </div>
                        </div>
                    `
                })
            });
            const result = await resp.json().catch(() => null);
            if (result && result.error) emailFailed = true;
        } catch (e) {
            console.warn('Error enviando email 2FA:', e);
            emailFailed = true;
        }
    } else {
        emailFailed = true;
    }

    return { code, emailFailed };
}

// Verificar código 2FA
async function verify2FACode(userId, inputCode) {
    const { data, error } = await supabaseClient
        .from('two_factor_codes')
        .select('*')
        .eq('user_id', userId)
        .eq('code', inputCode)
        .eq('used', false)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (error || !data) {
        return false;
    }

    // Marcar como usado
    await supabaseClient
        .from('two_factor_codes')
        .update({ used: true })
        .eq('id', data.id);

    return true;
}

// Completar login después de 2FA exitoso
function complete2FALogin(userData) {
    const session = {
        id: userData.id,
        email: userData.email,
        full_name: userData.full_name,
        role: userData.role,
        hotel_id: userData.hotel_id,
        superadmin_level: userData.superadmin_level
    };
    localStorage.setItem('omnihotel_session', JSON.stringify(session));
    return session;
}

// Activar/desactivar 2FA
async function toggle2FA(userId, enable) {
    const { error } = await supabaseClient
        .from('app_users')
        .update({ two_factor_enabled: enable })
        .eq('id', userId);
    return !error;
}

// Registrar nuevo usuario (via RPC seguro)
async function appRegister(email, password, fullName, hotelId, role = 'recepcionista', superadminLevel = null) {
    const passwordHash = await hashPassword(password);

    const { data, error } = await supabaseClient
        .rpc('app_register', {
            p_email: email.toLowerCase().trim(),
            p_password_hash: passwordHash,
            p_full_name: fullName,
            p_hotel_id: hotelId || null,
            p_role: role,
            p_superadmin_level: superadminLevel
        });

    if (error) {
        return { user: null, error: 'Error al crear usuario: ' + error.message };
    }

    if (data && data.error) {
        return { user: null, error: data.error };
    }

    return {
        user: data ? data.user : null,
        error: null,
        alreadyExists: data ? data.alreadyExists || false : false
    };
}

// Obtener sesión actual
function getSession() {
    const session = localStorage.getItem('omnihotel_session');
    return session ? JSON.parse(session) : null;
}

// Cerrar sesión
function appLogout() {
    localStorage.removeItem('omnihotel_session');
    sessionStorage.removeItem('omnihotel_session');
    window.location.href = 'login.html';
}

// Verificar sesión y redirigir si no hay
// Admin y Superadmin pueden acceder a cualquier vista ("Ver como")
function requireAuth(allowedRoles = []) {
    const session = getSession();
    if (!session) {
        window.location.href = 'login.html';
        return null;
    }
    const bypassRoles = ['admin', 'superadmin'];
    if (allowedRoles.length > 0 && !allowedRoles.includes(session.role) && !bypassRoles.includes(session.role)) {
        window.location.href = 'login.html';
        return null;
    }
    return session;
}

// Redirigir según rol después del login
function redirectByRole(role, guestHotelContext) {
    switch (role) {
        case 'superadmin':
            window.location.href = 'superadmin.html';
            break;
        case 'admin':
            window.location.href = 'admin.html';
            break;
        case 'recepcionista':
            window.location.href = 'frontdesk.html';
            break;
        case 'guest':
            // Si hay un hotel_id en contexto (viene desde URL de hotel), ir directo a ese hotel
            if (guestHotelContext) {
                window.location.href = 'guest.html?hotel_id=' + guestHotelContext;
            } else {
                window.location.href = 'guest.html';
            }
            break;
        case 'limpieza':
            window.location.href = 'housekeeping.html';
            break;
        default:
            console.error('Rol desconocido:', role);
    }
}

/* ==========================================================================
   SIDEBAR TOGGLE (GLOBAL - Desktop collapse + Mobile overlay)
   ========================================================================== */

window.toggleSidebar = function () {
    const isMobile = window.innerWidth <= 768;
    const container = document.querySelector('.app-container');
    const sidebar = container ? container.querySelector('.sidebar') : null;
    const backdrop = document.getElementById('sidebar-backdrop');

    if (isMobile) {
        // Mobile: toggle slide-in overlay
        if (sidebar) sidebar.classList.toggle('open');
        if (backdrop) backdrop.classList.toggle('show');
    } else {
        // Desktop: toggle collapse
        if (container) container.classList.toggle('sidebar-collapsed');
        // Save preference
        const isCollapsed = container.classList.contains('sidebar-collapsed');
        localStorage.setItem('omnihotel_sidebar', isCollapsed ? 'collapsed' : 'expanded');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Create backdrop for mobile
    if (!document.getElementById('sidebar-backdrop')) {
        const backdrop = document.createElement('div');
        backdrop.id = 'sidebar-backdrop';
        backdrop.className = 'sidebar-backdrop';
        backdrop.addEventListener('click', () => {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar) sidebar.classList.remove('open');
            backdrop.classList.remove('show');
        });
        document.body.appendChild(backdrop);
    }

    // Restore desktop sidebar state
    const savedState = localStorage.getItem('omnihotel_sidebar');
    if (savedState === 'collapsed' && window.innerWidth > 768) {
        const container = document.querySelector('.app-container');
        if (container) container.classList.add('sidebar-collapsed');
    }

    // Toast container
    if (!document.getElementById('toast-container')) {
        const container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    // Sincronizar branding SaaS desde Supabase (en segundo plano)
    loadSaaSBranding();
});

window.showToast = function (message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconClass = 'fa-solid fa-circle-info';
    if (type === 'success') iconClass = 'fa-solid fa-circle-check';
    if (type === 'error') iconClass = 'fa-solid fa-circle-exclamation';
    if (type === 'warning') iconClass = 'fa-solid fa-triangle-exclamation';

    toast.innerHTML = `
        <div class="toast-icon">
            <i class="${iconClass}"></i>
        </div>
        <div class="toast-message">${message}</div>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        setTimeout(() => toast.classList.add('show'), 10);
    });

    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hide');
        setTimeout(() => {
            if (toast.parentElement) toast.parentElement.removeChild(toast);
        }, 400);
    }, 3500);
};

// Función global para mostrar/ocultar contraseñas
window.togglePasswordVisibility = function (inputId, buttonEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const icon = buttonEl.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        }
    } else {
        input.type = 'password';
        if (icon) {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }
};

// Helpers globales para marca blanca del SaaS
// Leen de localStorage (caché local para rendimiento instantáneo)
// Se sincronizan con Supabase via loadSaaSBranding() al cargar cada página
window.getSaaSName = function() {
    return localStorage.getItem('omnihotel_saas_name') || 'TuHotel.pe';
};
window.getSaaSDescription = function() {
    return localStorage.getItem('omnihotel_saas_slogan') || 'Gestión Hotelera Inteligente';
};
window.getSaaSPrimaryColor = function() {
    return localStorage.getItem('omnihotel_saas_primary_color') || '#2563eb';
};
window.getSaaSLoginBg = function() {
    return localStorage.getItem('omnihotel_saas_login_bg') || 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)';
};
window.getSaaSSidebarColor = function() {
    return localStorage.getItem('omnihotel_saas_sidebar_color') || '#0f172a';
};
window.getSaaSSidebarTextColor = function() {
    return localStorage.getItem('omnihotel_saas_sidebar_text_color') || '#94a3b8';
};
window.getSaaSFont = function() {
    return localStorage.getItem('omnihotel_saas_font') || 'Inter';
};
window.getSaaSLoginCustomColor = function() {
    return localStorage.getItem('omnihotel_saas_login_custom_color') || '';
};
window.getSaaSPhone = function() {
    return localStorage.getItem('omnihotel_saas_phone') || '51999999999';
};

// Formatea cualquier número a formato numérico limpio de WhatsApp internacional
window.getCleanWhatsAppNumber = function(phone) {
    if (!phone) return '51999999999';
    let clean = String(phone).replace(/[^\d]/g, '');
    if (clean.length === 9 && clean.startsWith('9')) {
        clean = '51' + clean; // Perú mobile prefix
    }
    return clean || '51999999999';
};

// Cargar branding desde Supabase y guardar en localStorage (caché)
// Se llama al cargar cada página para sincronizar con la BD
window.loadSaaSBranding = async function() {
    try {
        const { data, error } = await supabaseClient
            .from('saas_settings')
            .select('*')
            .eq('id', '00000000-0000-0000-0000-000000000000')
            .single();

        if (error || !data) return; // Si falla, usa los valores de localStorage/defaults

        const phone = (data.settings && (data.settings.support_phone || data.settings.phone)) || data.contact_phone || '51999999999';

        // Sincronizar BD → localStorage
        localStorage.setItem('omnihotel_saas_name', data.platform_name || 'Tuhotel.pe');
        localStorage.setItem('omnihotel_saas_slogan', data.slogan || 'Centro Multi-Tenant');
        localStorage.setItem('omnihotel_saas_primary_color', data.primary_color || '#2563eb');
        localStorage.setItem('omnihotel_saas_login_bg', data.login_bg || 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)');
        localStorage.setItem('omnihotel_saas_sidebar_color', data.sidebar_color || '#0f172a');
        localStorage.setItem('omnihotel_saas_sidebar_text_color', data.sidebar_text_color || '#94a3b8');
        localStorage.setItem('omnihotel_saas_font', data.font_family || 'Inter');
        localStorage.setItem('omnihotel_saas_login_custom_color', data.login_custom_color || '');
        localStorage.setItem('omnihotel_saas_phone', phone);
    } catch (e) {
        // Silencioso: si falla la red, usa caché local
    }
};

// =========================================================================
// PLANES & MEMBRESÍAS SAAS GLOBALES
// =========================================================================
const DEFAULT_SAAS_PLANS = [
    {
        id: 'free',
        name: 'Plan Gratuito',
        price: 0,
        currency: 'S/',
        period: 'mes',
        description: 'Ideal para comenzar la digitalización de tu hotel sin costo inicial.',
        max_rooms: 8,
        max_daily_checkins: 10,
        max_room_photos: 2,
        allows_2fa: false,
        features: [
            'Hasta 8 habitaciones',
            'Hasta 2 fotos por habitación',
            'Hasta 10 check-ins al día',
            '100% módulos operativos incluidos',
            'Conserjería digital QR & WiFi',
            'Soporte estándar'
        ],
        badge: '🌱 Gratuito',
        is_featured: false,
        cta_text: 'Empezar Gratis',
        color: '#10b981',
        is_active: true
    },
    {
        id: 'standard',
        name: 'Plan Estándar',
        price: 59,
        currency: 'S/',
        period: 'mes',
        description: 'Para hoteles en crecimiento que buscan mayor capacidad y seguridad.',
        max_rooms: 20,
        max_daily_checkins: 999,
        max_room_photos: 6,
        allows_2fa: true,
        features: [
            'Hasta 20 habitaciones',
            'Hasta 6 fotos HD por habitación',
            'Check-ins y huéspedes ilimitados',
            'Seguridad 2FA / OTP por Email',
            'Conserjería digital QR & WiFi',
            'Soporte prioritario'
        ],
        badge: '🚀 Más Popular',
        is_featured: true,
        cta_text: 'Elegir Estándar',
        color: '#2563eb',
        is_active: true
    },
    {
        id: 'unlimited',
        name: 'Plan Ilimitado',
        price: 119,
        currency: 'S/',
        period: 'mes',
        description: 'Capacidad total sin restricciones para cadenas y hoteles grandes.',
        max_rooms: 999,
        max_daily_checkins: 999,
        max_room_photos: 99,
        allows_2fa: true,
        features: [
            'Habitaciones ilimitadas',
            'Fotos HD sin límite',
            'Check-ins y huéspedes ilimitados',
            'Seguridad 2FA + Multi-sucursal',
            'Conserjería digital QR & WiFi',
            'Soporte VIP 24/7'
        ],
        badge: '👑 Ilimitado',
        is_featured: false,
        cta_text: 'Elegir Ilimitado',
        color: '#7e22ce',
        is_active: true
    }
];
window.DEFAULT_SAAS_PLANS = DEFAULT_SAAS_PLANS;

window.getSaaSPlans = function() {
    try {
        const cached = localStorage.getItem('omnihotel_saas_plans');
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (e) {}
    return DEFAULT_SAAS_PLANS;
};

window.loadSaaSPlansFromDB = async function() {
    try {
        const { data } = await supabaseClient
            .from('saas_settings')
            .select('settings')
            .eq('id', '00000000-0000-0000-0000-000000000000')
            .single();

        if (data && data.settings && Array.isArray(data.settings.plans) && data.settings.plans.length > 0) {
            localStorage.setItem('omnihotel_saas_plans', JSON.stringify(data.settings.plans));
            return data.settings.plans;
        }
    } catch (e) {}
    return window.getSaaSPlans();
};

window.saveSaaSPlansToDB = async function(plansList) {
    try {
        const { data } = await supabaseClient
            .from('saas_settings')
            .select('settings')
            .eq('id', '00000000-0000-0000-0000-000000000000')
            .single();

        const existingSettings = (data && data.settings) || {};
        existingSettings.plans = plansList;

        const { error } = await supabaseClient
            .from('saas_settings')
            .update({ settings: existingSettings, updated_at: new Date().toISOString() })
            .eq('id', '00000000-0000-0000-0000-000000000000');

        if (!error) {
            localStorage.setItem('omnihotel_saas_plans', JSON.stringify(plansList));
        }
        return { error };
    } catch (err) {
        return { error: err };
    }
};

// Guardar branding en Supabase (llamado desde superadmin al guardar)
window.saveSaaSBrandingToDB = async function(settings) {
    try {
        const { data } = await supabaseClient
            .from('saas_settings')
            .select('settings')
            .eq('id', '00000000-0000-0000-0000-000000000000')
            .single();

        const currentSettings = (data && data.settings) || {};
        if (settings.phone !== undefined) {
            currentSettings.support_phone = settings.phone;
        }

        const { error } = await supabaseClient
            .from('saas_settings')
            .update({
                platform_name: settings.name,
                slogan: settings.slogan,
                primary_color: settings.color,
                login_bg: settings.loginBg,
                sidebar_color: settings.sidebarColor,
                sidebar_text_color: settings.sidebarTextColor,
                font_family: settings.font,
                login_custom_color: settings.loginCustomColor || '',
                settings: currentSettings,
                updated_at: new Date().toISOString()
            })
            .eq('id', '00000000-0000-0000-0000-000000000000');

        if (!error) {
            localStorage.setItem('omnihotel_saas_name', settings.name);
            localStorage.setItem('omnihotel_saas_slogan', settings.slogan);
            localStorage.setItem('omnihotel_saas_primary_color', settings.color);
            localStorage.setItem('omnihotel_saas_login_bg', settings.loginBg);
            localStorage.setItem('omnihotel_saas_sidebar_color', settings.sidebarColor);
            localStorage.setItem('omnihotel_saas_sidebar_text_color', settings.sidebarTextColor);
            localStorage.setItem('omnihotel_saas_font', settings.font);
            localStorage.setItem('omnihotel_saas_login_custom_color', settings.loginCustomColor || '');
            if (settings.phone !== undefined) {
                localStorage.setItem('omnihotel_saas_phone', settings.phone);
            }
        }
        return { error };
    } catch (err) {
        return { error: err };
    }
};

/* ==========================================================================
   SISTEMA UNIFICADO DE MODALES PREMIUM (omniModal)
   ========================================================================== */

/**
 * Crear y mostrar un modal premium.
 * @param {Object} options
 * @param {string} options.title - Título del modal (con HTML)
 * @param {string} [options.subtitle] - Subtítulo opcional
 * @param {string} options.body - HTML del cuerpo del modal
 * @param {string} [options.size] - 'narrow' | 'default' | 'wide'
 * @param {string} [options.id] - ID del modal para referencia
 * @param {string} [options.headerBg] - Gradiente/color del header (opcional)
 * @returns {HTMLElement} El elemento del modal
 */
window.omniModal = function(options) {
    // Remover modal previo con el mismo ID
    if (options.id) {
        const existing = document.getElementById(options.id);
        if (existing) existing.remove();
    }

    const sizeClass = options.size === 'wide' ? ' wide' : (options.size === 'narrow' ? ' narrow' : '');
    const headerStyle = options.headerBg ? `style="background:${options.headerBg}"` : '';

    const modal = document.createElement('div');
    modal.className = 'omni-modal';
    if (options.id) modal.id = options.id;

    const iconHtml = options.icon ? `
        <div style="width: 48px; height: 48px; border-radius: 14px; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-size: 1.35rem; backdrop-filter: blur(10px); flex-shrink: 0; color: white;">
            <i class="fa-solid ${options.icon}"></i>
        </div>
    ` : '';

    modal.innerHTML = `
        <div class="omni-modal-box${sizeClass}">
            <div class="omni-modal-header" ${headerStyle}>
                <button class="omni-modal-close" onclick="closeOmniModal(this)" aria-label="Cerrar">&times;</button>
                <div style="display: flex; align-items: center; gap: 14px;">
                    ${iconHtml}
                    <div>
                        <h3 style="color: white !important; margin: 0; font-size: 1.2rem; font-weight: 700;">${options.title}</h3>
                        ${options.subtitle ? `<p style="color: rgba(255,255,255,0.85) !important; margin: 0.2rem 0 0; font-size: 0.83rem;">${options.subtitle}</p>` : ''}
                    </div>
                </div>
            </div>
            <div class="omni-modal-body">
                ${options.body}
            </div>
        </div>
    `;

    // Cerrar al hacer click en el overlay (fuera del box)
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeOmniModal(modal);
    });

    document.body.appendChild(modal);
    return modal;
};

/**
 * Cerrar un modal premium con animación.
 * Funciona con .omni-modal Y con .modal (sistema legacy de admin/frontdesk)
 * @param {HTMLElement} el - El modal o cualquier elemento dentro del modal
 */
window.closeOmniModal = function(el) {
    if (!el) {
        const openOmni = document.querySelector('.omni-modal:not(.closing)');
        if (openOmni) {
            openOmni.classList.add('closing');
            setTimeout(() => openOmni.remove(), 220);
            return;
        }
        const openLegacy = document.querySelector('.modal.show');
        if (openLegacy) el = openLegacy;
        else return;
    }
    // Try omni-modal first
    let modal = (el && el.closest) ? el.closest('.omni-modal') : el;
    if (modal && modal.classList && modal.classList.contains('omni-modal')) {
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), 220);
        return;
    }
    // Try legacy .modal
    modal = (el && el.closest) ? el.closest('.modal') : el;
    if (modal && modal.classList && modal.classList.contains('modal')) {
        const content = modal.querySelector('.modal-content');
        if (content) content.style.animation = 'slideOut 0.2s ease-in forwards';
        modal.style.animation = 'fadeOut 0.2s ease-in forwards';
        setTimeout(() => {
            modal.classList.remove('show');
            if (content) content.style.animation = '';
            modal.style.animation = '';
        }, 200);
        return;
    }
};

// ESC cierra el modal premium/legacy más reciente
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // Primero cerrar lightbox si está abierto
        const lightbox = document.querySelector('.omni-lightbox.show');
        if (lightbox) { closeLightbox(); return; }
        // Cerrar omni-modal
        const omniModals = document.querySelectorAll('.omni-modal:not(.closing)');
        if (omniModals.length > 0) { closeOmniModal(omniModals[omniModals.length - 1]); return; }
        // Cerrar modal legacy
        const legacyModals = document.querySelectorAll('.modal.show');
        if (legacyModals.length > 0) closeOmniModal(legacyModals[legacyModals.length - 1]);
    }
});

// Click afuera cierra modales legacy (.modal)
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal') && e.target.classList.contains('show')) {
        closeOmniModal(e.target);
    }
});

/* ==========================================================================
   LIGHTBOX GLOBAL DE IMÁGENES (omniLightbox)
   ========================================================================== */

let lightboxImages = [];
let lightboxIndex = 0;

function initLightbox() {
    if (document.getElementById('omni-lightbox')) return;
    const lb = document.createElement('div');
    lb.id = 'omni-lightbox';
    lb.className = 'omni-lightbox';
    lb.innerHTML = `
        <button class="omni-lightbox-close" onclick="closeLightbox()"><i class="fa-solid fa-xmark"></i></button>
        <button class="omni-lightbox-nav omni-lightbox-prev" onclick="lightboxNav(-1)" style="display:none;"><i class="fa-solid fa-chevron-left"></i></button>
        <img class="omni-lightbox-img" src="" alt="Vista ampliada" onclick="event.stopPropagation()">
        <button class="omni-lightbox-nav omni-lightbox-next" onclick="lightboxNav(1)" style="display:none;"><i class="fa-solid fa-chevron-right"></i></button>
        <div class="omni-lightbox-counter" style="display:none;"></div>
    `;
    lb.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });
    document.body.appendChild(lb);
}

/**
 * Abrir lightbox con una o varias imágenes.
 * @param {string|string[]} images - URL(s) de imagen(es)
 * @param {number} [startIndex=0] - Índice inicial
 */
window.openLightbox = function(images, startIndex = 0) {
    initLightbox();
    lightboxImages = Array.isArray(images) ? images : [images];
    lightboxIndex = startIndex;

    const lb = document.getElementById('omni-lightbox');
    const prevBtn = lb.querySelector('.omni-lightbox-prev');
    const nextBtn = lb.querySelector('.omni-lightbox-next');
    const counter = lb.querySelector('.omni-lightbox-counter');

    if (lightboxImages.length > 1) {
        prevBtn.style.display = 'flex';
        nextBtn.style.display = 'flex';
        counter.style.display = 'block';
    } else {
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        counter.style.display = 'none';
    }

    updateLightboxImage();
    lb.classList.remove('closing');
    lb.classList.add('show');
    document.body.style.overflow = 'hidden';
};

window.closeLightbox = function() {
    const lb = document.getElementById('omni-lightbox');
    if (!lb) return;
    lb.classList.add('closing');
    setTimeout(() => {
        lb.classList.remove('show', 'closing');
        document.body.style.overflow = '';
    }, 200);
};

window.lightboxNav = function(dir) {
    lightboxIndex = (lightboxIndex + dir + lightboxImages.length) % lightboxImages.length;
    updateLightboxImage();
};

function updateLightboxImage() {
    const lb = document.getElementById('omni-lightbox');
    if (!lb) return;
    const img = lb.querySelector('.omni-lightbox-img');
    const counter = lb.querySelector('.omni-lightbox-counter');
    img.src = lightboxImages[lightboxIndex];
    if (lightboxImages.length > 1) {
        counter.textContent = `${lightboxIndex + 1} / ${lightboxImages.length}`;
    }
}

// Keyboard navigation for lightbox
document.addEventListener('keydown', (e) => {
    const lb = document.getElementById('omni-lightbox');
    if (!lb || !lb.classList.contains('show')) return;
    if (e.key === 'ArrowRight') lightboxNav(1);
    if (e.key === 'ArrowLeft') lightboxNav(-1);
});

// Auto-attach: make any <img> with data-lightbox="true" clickable
document.addEventListener('click', (e) => {
    const img = e.target.closest('img[data-lightbox]');
    if (!img) return;
    e.preventDefault();
    e.stopPropagation();

    // Check for gallery (multiple images in same container)
    const gallery = img.getAttribute('data-gallery');
    if (gallery) {
        const allImgs = Array.from(document.querySelectorAll(`img[data-gallery="${gallery}"]`));
        const urls = allImgs.map(i => i.src || i.getAttribute('data-full'));
        const idx = allImgs.indexOf(img);
        openLightbox(urls, idx);
    } else {
        const src = img.getAttribute('data-full') || img.src;
        openLightbox(src);
    }
});

// =========================================================================
// GEO-DISTANCIA: Calcular distancia en km entre dos coordenadas (Haversine)
// =========================================================================
function calculateGeoDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((R * c).toFixed(1)); // km con 1 decimal
}

// =========================================================================
// EMAIL: Enviar credenciales de acceso al nuevo dueño de hotel (vía Google Apps Script)
// =========================================================================
async function sendHotelApprovalEmail({ ownerEmail, ownerName, hotelName, tempPassword }) {
    if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL === 'LA_URL_DE_TU_SCRIPT_AQUI') {
        console.warn('Apps Script URL no configurada para envío de emails.');
        return { success: false, reason: 'no_script_url' };
    }

    const saasName = getSaaSName();
    const saasColor = getSaaSPrimaryColor();
    const loginUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'admin.html';

    const emailHtml = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 540px; margin: 0 auto; color: #1e293b; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
            <div style="background: linear-gradient(135deg, ${saasColor}, #6366f1); padding: 2.25rem 1.75rem; text-align: center; color: white;">
                <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">🏨</div>
                <h1 style="margin: 0; font-size: 1.45rem; font-weight: 700;">¡Bienvenido a ${saasName}!</h1>
                <p style="margin: 0.35rem 0 0; font-size: 0.9rem; opacity: 0.9;">Tu hotel ha sido aprobado y activado con éxito</p>
            </div>
            
            <div style="padding: 2rem 1.75rem;">
                <p style="margin: 0 0 1rem; font-size: 1rem;">Estimado(a) <strong>${ownerName}</strong>,</p>
                <p style="margin: 0 0 1.5rem; font-size: 0.92rem; color: #475569; line-height: 1.5;">
                    Nos complace informarte que la afiliación de tu establecimiento <strong>${hotelName}</strong> ha sido verificada y aprobada por nuestro equipo.
                </p>

                <div style="background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 12px; padding: 1.25rem; margin-bottom: 1.75rem;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 0.75rem; letter-spacing: 0.5px;">Tus Credenciales de Administrador:</div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.92rem;">
                        <tr>
                            <td style="padding: 4px 0; color: #64748b; width: 110px;">Panel de Acceso:</td>
                            <td style="padding: 4px 0;"><a href="${loginUrl}" style="color: ${saasColor}; text-decoration: none; font-weight: 600;">Abrir Panel de Administración &rarr;</a></td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; color: #64748b;">Usuario / Email:</td>
                            <td style="padding: 4px 0; font-weight: 700; color: #1e293b;">${ownerEmail}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; color: #64748b;">Clave Temporal:</td>
                            <td style="padding: 4px 0;"><code style="background: #e2e8f0; padding: 3px 8px; border-radius: 6px; font-weight: 700; color: #0f172a; font-size: 1rem;">${tempPassword}</code></td>
                        </tr>
                    </table>
                </div>

                <div style="text-align: center; margin-bottom: 1.75rem;">
                    <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, ${saasColor}, #6366f1); color: white; text-decoration: none; padding: 0.85rem 2rem; border-radius: 12px; font-weight: 700; font-size: 0.95rem; box-shadow: 0 4px 14px rgba(99,102,241,0.3);">
                        Ingresar a mi Panel de Hotel &rarr;
                    </a>
                </div>

                <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 0.85rem; font-size: 0.82rem; color: #1e40af; display: flex; align-items: center; gap: 8px;">
                    <span>💡 <strong>Consejo de seguridad:</strong> Te recomendamos cambiar tu contraseña temporal en la sección <em>Configuración &gt; Seguridad</em> tras tu primer ingreso.</span>
                </div>
            </div>

            <div style="background: #f8fafc; padding: 1rem 1.75rem; border-top: 1px solid #e2e8f0; text-align: center; font-size: 0.76rem; color: #94a3b8;">
                &copy; ${new Date().getFullYear()} ${saasName} &bull; Plataforma de Gestión Hotelera &bull; Soporte 24/7
            </div>
        </div>
    `;

    try {
        const resp = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'send_email',
                to: ownerEmail,
                subject: `¡Bienvenido a ${saasName}! Credenciales de Acceso para ${hotelName}`,
                body: emailHtml
            })
        });
        const resJson = await resp.json().catch(() => null);
        return { success: true, resJson };
    } catch (e) {
        console.warn('Error al enviar email de aprobación:', e);
        return { success: false, error: e.message };
    }
}
