import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
          toast.error(error.message);
        } else {
          toast.success("Registration successful. Please check your email if verification is required.");
          onOpenChange(false);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          toast.error(error.message);
        } else {
          toast.success("Successfully logged in");
          onOpenChange(false);
        }
      }
    } catch {
      toast.error("Sign in is temporarily unavailable. Please try again shortly.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isSignUp ? "Create an account" : "Sign in to OfficeNeed"}</DialogTitle>
          <DialogDescription>
            {isSignUp ? "Sign up to manage your orders and enquiries." : "Welcome back! Please sign in to continue."}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            {isSignUp ? "Sign Up" : "Sign In"}
          </Button>
        </form>

        <div className="text-center text-sm text-muted-foreground mt-2">
          {isSignUp ? "Already have an account? " : "Don't have an account? "}
          <button
            type="button"
            className="text-primary hover:underline font-medium"
            onClick={() => setIsSignUp(!isSignUp)}
          >
            {isSignUp ? "Sign in" : "Create one"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
