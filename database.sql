-- =====================================================================================
-- ESQUEMA MAESTRO COMPLETO: OmniHotel / Hotel.pe PMS (SaaS Multi-Tenant)
-- Contiene todas las tablas, relaciones, 2FA, soporte, mensajería, tokens y seguridad RLS.
-- =====================================================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLA DE HOTELES (Tenants)
CREATE TABLE IF NOT EXISTS public.hotels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  ruc TEXT NOT NULL UNIQUE,
  address TEXT,
  timezone TEXT DEFAULT 'America/Lima',
  -- settings incluye: location, guest_directory, primary_color, sidebar_color,
  -- subscription: { plan: 'free'|'standard'|'unlimited', max_rooms: 8, max_daily_checkins: 10, max_room_photos: 2, promotional_mode: true, status: 'active', expires_at: null }
  settings JSONB DEFAULT '{"subscription": {"plan": "free", "max_rooms": 8, "max_daily_checkins": 10, "max_room_photos": 2, "promotional_mode": true, "status": "active", "expires_at": null}}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. TABLA DE USUARIOS DEL SISTEMA (Autenticación interna)
CREATE TABLE IF NOT EXISTS public.app_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  hotel_id UUID REFERENCES public.hotels(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'recepcionista' CHECK (role IN ('superadmin', 'admin', 'recepcionista', 'guest', 'limpieza')),
  is_active BOOLEAN DEFAULT true,
  two_factor_enabled BOOLEAN DEFAULT false,
  superadmin_level INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. TABLA DE TOKENS DE RECUPERACIÓN DE CONTRASEÑA
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT unique_user_token UNIQUE (user_id)
);

-- 5. TABLA DE CÓDIGOS TEMPORALES 2FA
CREATE TABLE IF NOT EXISTS public.two_factor_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_2fa_user ON public.two_factor_codes(user_id);

-- 6. TABLA DE HABITACIONES
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_number TEXT NOT NULL,
  floor TEXT,
  capacity INTEGER DEFAULT 2,
  base_price NUMERIC NOT NULL,
  status TEXT DEFAULT 'disponible' CHECK (status IN ('disponible', 'ocupada', 'limpieza', 'mantenimiento', 'bloqueada')),
  features JSONB DEFAULT '[]'::jsonb,
  images TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rooms_hotel ON public.rooms(hotel_id);

-- 7. TABLA DE RESERVAS
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  guest_name TEXT NOT NULL,
  guest_document TEXT NOT NULL,
  guest_phone TEXT,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  total_amount NUMERIC NOT NULL,
  status TEXT DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'confirmada', 'check_in', 'check_out', 'cancelada')),
  magic_token UUID DEFAULT uuid_generate_v4(),
  attachments JSONB DEFAULT '[]'::jsonb,
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bookings_hotel ON public.bookings(hotel_id);
CREATE INDEX IF NOT EXISTS idx_bookings_room ON public.bookings(room_id);

-- 8. TURNOS DE CAJA
CREATE TABLE IF NOT EXISTS public.cash_shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  start_time TIMESTAMPTZ DEFAULT now(),
  end_time TIMESTAMPTZ,
  initial_cash NUMERIC DEFAULT 0.00,
  final_cash NUMERIC,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. PRODUCTOS E INVENTARIO POS
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'fisico' CHECK (type IN ('fisico', 'servicio')),
  price NUMERIC NOT NULL,
  stock_quantity INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. ÓRDENES / PEDIDOS (POS & Room Service)
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  shift_id UUID REFERENCES public.cash_shifts(id) ON DELETE SET NULL,
  total_amount NUMERIC NOT NULL,
  is_paid BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. DETALLES DE ÓRDENES
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC NOT NULL,
  subtotal NUMERIC NOT NULL
);

-- 12. PAGOS
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  shift_id UUID REFERENCES public.cash_shifts(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  payment_method TEXT NOT NULL,
  operation_number TEXT,
  timestamp TIMESTAMPTZ DEFAULT now(),
  proof_url TEXT,
  proof_attachments JSONB DEFAULT '[]'::jsonb,
  method TEXT
);

-- 13. PUNTOS DE FIDELIZACIÓN (Loyalty)
CREATE TABLE IF NOT EXISTS public.loyalty_points (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guest_document TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  points INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 14. RESEÑAS POST CHECK-OUT
CREATE TABLE IF NOT EXISTS public.guest_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE UNIQUE,
  guest_document TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 15. AFILIACIÓN DE HUÉSPEDES A HOTELES
CREATE TABLE IF NOT EXISTS public.guest_hotel_affiliations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guest_email TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 16. LOGS DE LIMPIEZA (Housekeeping)
CREATE TABLE IF NOT EXISTS public.housekeeping_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  cleaner_name TEXT NOT NULL,
  cleaner_email TEXT NOT NULL,
  status_from TEXT NOT NULL,
  status_to TEXT NOT NULL,
  notes TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 17. CONFIGURACIÓN GLOBAL SAAS (Marca Blanca)
CREATE TABLE IF NOT EXISTS public.saas_settings (
  id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  platform_name TEXT NOT NULL DEFAULT 'Tuhotel.pe',
  slogan TEXT DEFAULT 'Centro Multi-Tenant',
  primary_color TEXT DEFAULT '#2563eb',
  login_bg TEXT DEFAULT 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
  sidebar_color TEXT DEFAULT '#0f172a',
  sidebar_text_color TEXT DEFAULT '#94a3b8',
  font_family TEXT DEFAULT 'Inter',
  login_custom_color TEXT DEFAULT '',
  settings JSONB DEFAULT '{"faqs":[]}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Fila inicial por defecto de configuración SaaS
INSERT INTO public.saas_settings (id, platform_name, slogan, primary_color, login_bg, sidebar_color, sidebar_text_color, font_family, settings)
VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'Tuhotel.pe',
  'Centro Multi-Tenant',
  '#2563eb',
  'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
  '#0f172a',
  '#94a3b8',
  'Inter',
  '{"support_phone": "51999999999", "faqs": [], "plans": []}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- 18. TICKETS DE SOPORTE (Hotel ↔ SuperAdmin)
CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID REFERENCES public.hotels(id) ON DELETE CASCADE,
    ticket_number SERIAL,
    category TEXT NOT NULL CHECK (category IN ('error', 'mejora', 'duda', 'facturacion', 'otro')),
    subject TEXT NOT NULL,
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('baja', 'normal', 'alta', 'urgente')),
    status TEXT DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'en_proceso', 'resuelto', 'cerrado')),
    created_by_name TEXT NOT NULL,
    created_by_role TEXT NOT NULL DEFAULT 'admin',
    last_message_at TIMESTAMPTZ DEFAULT now(),
    unread_by_admin INT DEFAULT 0,
    unread_by_superadmin INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    hotel_id UUID REFERENCES public.hotels(id) ON DELETE CASCADE,
    sender_name TEXT NOT NULL,
    sender_role TEXT NOT NULL CHECK (sender_role IN ('admin', 'superadmin', 'recepcion')),
    message TEXT NOT NULL,
    attachments JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 19. MENSAJERÍA DE CONSERJERÍA (Huésped ↔ Hotel)
CREATE TABLE IF NOT EXISTS public.guest_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    guest_id UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
    guest_name TEXT NOT NULL,
    guest_email TEXT NOT NULL,
    guest_phone TEXT,
    room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
    room_number TEXT,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    inquiry_type TEXT NOT NULL DEFAULT 'consulta_general' 
        CHECK (inquiry_type IN ('consulta_general', 'habitacion_activa', 'servicio_cuarto', 'limpieza', 'mantenimiento', 'otro')),
    subject TEXT NOT NULL,
    status TEXT DEFAULT 'pendiente' 
        CHECK (status IN ('pendiente', 'en_proceso', 'atendido', 'cerrado')),
    unread_by_hotel INT DEFAULT 1,
    unread_by_guest INT DEFAULT 0,
    last_message_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guest_conversation_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES public.guest_conversations(id) ON DELETE CASCADE,
    hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('guest', 'hotel')),
    sender_name TEXT NOT NULL,
    sender_role TEXT DEFAULT 'guest',
    message TEXT NOT NULL,
    attachments JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 20. SOLICITUDES DE AFILIACIÓN DE HOTELES (Dueños de Hoteles → SuperAdmin)
CREATE TABLE IF NOT EXISTS public.hotel_affiliation_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_name TEXT NOT NULL,
    ruc TEXT NOT NULL,
    city TEXT,
    address TEXT,
    owner_name TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    owner_phone TEXT NOT NULL,
    room_count INT DEFAULT 10,
    notes TEXT,
    status TEXT DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'aprobada', 'rechazada')),
    created_at TIMESTAMPTZ DEFAULT now(),
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES public.app_users(id)
);
CREATE INDEX IF NOT EXISTS idx_affil_req_status ON public.hotel_affiliation_requests(status);
CREATE INDEX IF NOT EXISTS idx_affil_req_email ON public.hotel_affiliation_requests(owner_email);

-- =====================================================================================
-- 21. TABLA DE RESEÑAS Y CALIFICACIONES DE HOTELES (Reviews de Huéspedes)
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.hotel_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    guest_name TEXT NOT NULL,
    guest_email TEXT,
    room_number TEXT,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL,
    status TEXT DEFAULT 'aprobada' CHECK (status IN ('pendiente', 'aprobada', 'oculta')),
    is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reviews_hotel ON public.hotel_reviews(hotel_id);
CREATE INDEX IF NOT EXISTS idx_reviews_featured ON public.hotel_reviews(is_featured);

-- =====================================================================================
-- 22. TABLA DE COMUNICADOS Y DIFUSIÓN GLOBAL (SuperAdmin -> Hoteles)
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.system_broadcasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('normal', 'importante', 'urgente')),
    target_type TEXT DEFAULT 'all' CHECK (target_type IN ('all', 'hotel', 'guests')),
    target_hotel_id UUID REFERENCES public.hotels(id) ON DELETE CASCADE,
    sender_name TEXT DEFAULT 'SuperAdmin',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_broadcast_hotel ON public.system_broadcasts(target_hotel_id);

-- =====================================================================================
-- 23. PROCEDIMIENTOS ALMACENADOS (RPC)
-- =====================================================================================

-- RPC Login con soporte 2FA
CREATE OR REPLACE FUNCTION public.app_login(p_email text, p_pass_hash text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user record;
BEGIN
    SELECT id, email, full_name, role, hotel_id, superadmin_level, two_factor_enabled
    INTO v_user
    FROM app_users
    WHERE email = lower(trim(p_email))
      AND password_hash = p_pass_hash
      AND is_active = true;

    IF v_user IS NULL THEN
        RETURN json_build_object('user', null, 'error', 'Correo o contraseña incorrectos');
    END IF;

    RETURN json_build_object(
        'user', json_build_object(
            'id', v_user.id,
            'email', v_user.email,
            'full_name', v_user.full_name,
            'role', v_user.role,
            'hotel_id', v_user.hotel_id,
            'superadmin_level', v_user.superadmin_level,
            'two_factor_enabled', COALESCE(v_user.two_factor_enabled, false)
        ),
        'error', null
    );
END;
$$;

-- =====================================================================================
-- 24. HABILITAR REALTIME (Soporte, Broadcasts & Reseñas)
-- =====================================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'support_tickets') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE support_tickets;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'support_messages') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE support_messages;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'guest_conversations') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE guest_conversations;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'guest_conversation_messages') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE guest_conversation_messages;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'system_broadcasts') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE system_broadcasts;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'hotel_reviews') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE hotel_reviews;
    END IF;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;
