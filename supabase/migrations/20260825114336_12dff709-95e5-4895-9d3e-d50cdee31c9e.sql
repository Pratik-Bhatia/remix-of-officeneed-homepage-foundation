-- Role infrastructure
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;
CREATE POLICY "Users can read their own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- corporate_quote_requests: no anon reads
ALTER TABLE public.corporate_quote_requests ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, UPDATE, DELETE ON public.corporate_quote_requests FROM anon;
REVOKE SELECT, UPDATE, DELETE ON public.corporate_quote_requests FROM authenticated;
GRANT INSERT ON public.corporate_quote_requests TO anon, authenticated;
GRANT SELECT, UPDATE ON public.corporate_quote_requests TO authenticated;
GRANT ALL ON public.corporate_quote_requests TO service_role;

DROP POLICY IF EXISTS "Admins can read corporate quote requests" ON public.corporate_quote_requests;
CREATE POLICY "Admins can read corporate quote requests"
ON public.corporate_quote_requests FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update corporate quote requests" ON public.corporate_quote_requests;
CREATE POLICY "Admins can update corporate quote requests"
ON public.corporate_quote_requests FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- product_enquiry_attachments: no anon reads
ALTER TABLE public.product_enquiry_attachments ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, UPDATE, DELETE ON public.product_enquiry_attachments FROM anon;
REVOKE SELECT, UPDATE, DELETE ON public.product_enquiry_attachments FROM authenticated;
GRANT INSERT ON public.product_enquiry_attachments TO anon, authenticated;
GRANT SELECT ON public.product_enquiry_attachments TO authenticated;
GRANT ALL ON public.product_enquiry_attachments TO service_role;

DROP POLICY IF EXISTS "Admins can read enquiry attachments" ON public.product_enquiry_attachments;
CREATE POLICY "Admins can read enquiry attachments"
ON public.product_enquiry_attachments FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));