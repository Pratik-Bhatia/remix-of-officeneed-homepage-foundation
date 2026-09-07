REVOKE ALL ON public.customer_saves FROM anon, authenticated;
CREATE POLICY "No direct client access to saved products"
  ON public.customer_saves
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);