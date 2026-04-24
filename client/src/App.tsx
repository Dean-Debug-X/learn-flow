import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import CourseDetail from "./pages/CourseDetail";
import MyLearning from "./pages/MyLearning";
import Pricing from "./pages/Pricing";
import NotificationsCenter from "./pages/NotificationsCenter";
import Login from "./pages/Login";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminCourses from "./pages/admin/AdminCourses";
import AdminCategories from "./pages/admin/AdminCategories";
import AdminComments from "./pages/admin/AdminComments";
import AdminMedia from "./pages/admin/AdminMedia";
import AdminSite from "./pages/admin/AdminSite";
import AdminProducts from "./pages/admin/AdminProducts";
import AdminOrders from "./pages/admin/AdminOrders";
import AdminPaymentNotifications from "./pages/admin/AdminPaymentNotifications";
import AdminSystemConfig from "./pages/admin/AdminSystemConfig";
import AdminAccess from "./pages/admin/AdminAccess";
import AdminAuditCenter from "./pages/admin/AdminAuditCenter";
import AdminAuditAlerts from "./pages/admin/AdminAuditAlerts";
import AdminRiskPanel from "./pages/admin/AdminRiskPanel";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/course/:slug" component={CourseDetail} />
      <Route path="/me" component={MyLearning} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/notifications" component={NotificationsCenter} />
      <Route path="/login" component={Login} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/courses" component={AdminCourses} />
      <Route path="/admin/categories" component={AdminCategories} />
      <Route path="/admin/comments" component={AdminComments} />
      <Route path="/admin/media" component={AdminMedia} />
      <Route path="/admin/products" component={AdminProducts} />
      <Route path="/admin/orders" component={AdminOrders} />
      <Route path="/admin/payment-notifications" component={AdminPaymentNotifications} />
      <Route path="/admin/site" component={AdminSite} />
      <Route path="/admin/system" component={AdminSystemConfig} />
      <Route path="/admin/access" component={AdminAccess} />
      <Route path="/admin/audit" component={AdminAuditCenter} />
      <Route path="/admin/audit-alerts" component={AdminAuditAlerts} />
      <Route path="/admin/risk" component={AdminRiskPanel} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
