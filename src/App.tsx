import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Contact from "./pages/Contact";
import Donate from "./pages/Donate";
import NotFound from "./pages/NotFound";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminPanel from "./pages/admin/AdminPanel";
import HMISLogin from "./pages/hmis/HMISLogin";
import HMISPanel from "./pages/hmis/HMISPanel";
import VolunteerLogin from "./pages/volunteer/VolunteerLogin";
import VolunteerPanel from "./pages/volunteer/VolunteerPanel";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/donate" element={<Donate />} />
          {/* Admin Portal */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/*" element={<AdminPanel />} />
          {/* HMIS Portal */}
          <Route path="/hmis/login" element={<HMISLogin />} />
          <Route path="/hmis/*" element={<HMISPanel />} />
          {/* Volunteer Portal */}
          <Route path="/volunteer/login" element={<VolunteerLogin />} />
          <Route path="/volunteer/*" element={<VolunteerPanel />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
