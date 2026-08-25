import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/admin/quotes")({
  component: AdminQuotesPage,
});

function AdminQuotesPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuote, setSelectedQuote] = useState<any | null>(null);

  useEffect(() => {
    fetchQuotes();
  }, []);

  const fetchQuotes = async () => {
    try {
      setLoading(true);
      // Client-side fetch using anon key for demo purposes (assuming policies allow admin view)
      // In a real setup, this would be behind authentication.
      const supabaseUrl = import.meta.env['VITE_SUPABASE_URL'];
      const supabaseKey = import.meta.env['VITE_SUPABASE_ANON_KEY'];
      
      if (!supabaseUrl || !supabaseKey) {
        console.warn("Supabase credentials missing");
        return;
      }
      
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const { data, error } = await supabase
        .from("corporate_quote_requests")
        .select("*")
        .order("created_at", { ascending: false });
        
      if (error) throw error;
      setRequests(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const supabaseUrl = import.meta.env['VITE_SUPABASE_URL'];
      const supabaseKey = import.meta.env['VITE_SUPABASE_ANON_KEY'];
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      await supabase
        .from("corporate_quote_requests")
        .update({ status })
        .eq("id", id);
        
      setRequests(prev => prev.map(req => req.id === id ? { ...req, status } : req));
      if (selectedQuote?.id === id) {
        setSelectedQuote({ ...selectedQuote, status });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "new": return "default";
      case "contacted": return "secondary";
      case "quoted": return "outline";
      case "approved": return "default"; // green would be better
      case "completed": return "secondary";
      case "cancelled": return "destructive";
      default: return "default";
    }
  };

  const getPreviewUrl = (path: string) => {
    const supabaseUrl = import.meta.env['VITE_SUPABASE_URL'];
    return `${supabaseUrl}/storage/v1/object/public/corporate-quote-assets/${path}`;
  };

  return (
    <div className="container mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold mb-8">Corporate Quote Requests</h1>
      
      <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="px-6 py-4 font-semibold">Reference</th>
              <th className="px-6 py-4 font-semibold">Company</th>
              <th className="px-6 py-4 font-semibold">Product</th>
              <th className="px-6 py-4 font-semibold text-right">Qty</th>
              <th className="px-6 py-4 font-semibold">Date</th>
              <th className="px-6 py-4 font-semibold">Status</th>
              <th className="px-6 py-4 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : requests.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">No quote requests found.</td></tr>
            ) : (
              requests.map((req) => (
                <tr key={req.id} className="border-b border-border hover:bg-muted/20">
                  <td className="px-6 py-4 font-medium">ON-{new Date(req.created_at).getFullYear()}-{req.id.substring(0, 4).toUpperCase()}</td>
                  <td className="px-6 py-4">{req.company_name}</td>
                  <td className="px-6 py-4">{req.product_name}</td>
                  <td className="px-6 py-4 text-right">{req.quantity}</td>
                  <td className="px-6 py-4 text-muted-foreground">{new Date(req.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4">
                    <Badge variant={getStatusColor(req.status) as any}>{req.status.toUpperCase()}</Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button variant="outline" size="sm" onClick={() => setSelectedQuote(req)}>View Details</Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedQuote && (
        <Dialog open={!!selectedQuote} onOpenChange={(open) => !open && setSelectedQuote(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl">Quote Details: ON-{new Date(selectedQuote.created_at).getFullYear()}-{selectedQuote.id.substring(0, 4).toUpperCase()}</DialogTitle>
            </DialogHeader>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-lg border-b pb-2 mb-4">Customer Info</h3>
                  <div className="grid grid-cols-2 gap-y-3 text-sm">
                    <span className="text-muted-foreground">Name:</span> <span className="font-medium">{selectedQuote.customer_name}</span>
                    <span className="text-muted-foreground">Company:</span> <span className="font-medium">{selectedQuote.company_name}</span>
                    <span className="text-muted-foreground">Email:</span> <span className="font-medium">{selectedQuote.work_email}</span>
                    <span className="text-muted-foreground">Phone:</span> <span className="font-medium">{selectedQuote.phone}</span>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-semibold text-lg border-b pb-2 mb-4">Requirements</h3>
                  <div className="grid grid-cols-2 gap-y-3 text-sm">
                    <span className="text-muted-foreground">Product:</span> <span className="font-medium">{selectedQuote.product_name}</span>
                    <span className="text-muted-foreground">Quantity:</span> <span className="font-medium">{selectedQuote.quantity}</span>
                    <span className="text-muted-foreground">Required Date:</span> <span className="font-medium">{selectedQuote.required_delivery_date || "N/A"}</span>
                    <span className="text-muted-foreground">Delivery To:</span> <span className="font-medium">{selectedQuote.delivery_location}</span>
                  </div>
                  {selectedQuote.additional_requirements && (
                    <div className="mt-3 text-sm">
                      <span className="text-muted-foreground block mb-1">Additional Notes:</span>
                      <p className="bg-muted/30 p-3 rounded-md">{selectedQuote.additional_requirements}</p>
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="font-semibold text-lg border-b pb-2 mb-4">Status Update</h3>
                  <Select value={selectedQuote.status} onValueChange={(val) => updateStatus(selectedQuote.id, val)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="quoted">Quoted</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <h3 className="font-semibold text-lg border-b pb-2 mb-4">Customization Preview</h3>
                {selectedQuote.preview_image_path ? (
                  <div className="rounded-xl border overflow-hidden bg-muted/20">
                    <img src={getPreviewUrl(selectedQuote.preview_image_path)} alt="Preview" className="w-full h-auto object-contain" />
                  </div>
                ) : (
                  <div className="p-8 text-center text-muted-foreground bg-muted/20 rounded-xl border">No preview generated.</div>
                )}
                
                {selectedQuote.logo_storage_path && (
                  <div className="mt-6 flex items-center justify-between p-4 border rounded-xl bg-muted/10">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-white rounded border flex items-center justify-center overflow-hidden p-1">
                         <img src={getPreviewUrl(selectedQuote.logo_storage_path)} alt="Logo" className="w-full h-full object-contain" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Uploaded Logo</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[150px]">{selectedQuote.logo_filename}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <a href={getPreviewUrl(selectedQuote.logo_storage_path)} target="_blank" rel="noreferrer">Download Logo</a>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
