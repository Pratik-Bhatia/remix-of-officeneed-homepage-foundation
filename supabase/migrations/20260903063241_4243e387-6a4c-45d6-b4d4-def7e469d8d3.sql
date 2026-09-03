CREATE TABLE public.product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_handle text NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title text NOT NULL,
  body text NOT NULL,
  author_name text NOT NULL,
  author_email text NOT NULL,
  is_verified_buyer boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.product_reviews TO anon;
GRANT INSERT ON public.product_reviews TO anon;
GRANT SELECT, INSERT ON public.product_reviews TO authenticated;
GRANT ALL ON public.product_reviews TO service_role;

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can read only approved reviews
CREATE POLICY "Anyone can view approved reviews"
ON public.product_reviews
FOR SELECT
TO anon, authenticated
USING (status = 'approved');

-- Anyone can submit a new review
CREATE POLICY "Anyone can submit a review"
ON public.product_reviews
FOR INSERT
TO anon, authenticated
WITH CHECK (true);