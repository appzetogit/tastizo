import { Suspense, lazy } from "react"
import { Routes, Route, Navigate } from "react-router-dom"
import ProtectedRoute from "@food/components/ProtectedRoute"
import Loader from "@food/components/Loader"
import RestaurantDesktopLayout from "@food/components/restaurant/RestaurantDesktopLayout"
import "./restaurantTheme.css"

// Lazy Loading Components
const RestaurantNotifications = lazy(() => import("@food/pages/restaurant/Notifications"))
const RestaurantOrderHistoryEntry = lazy(() => import("@food/pages/restaurant/RestaurantOrderHistoryEntry"))
const OrderDetails = lazy(() => import("@food/pages/restaurant/OrderDetails"))
const RestaurantOrdersEntry = lazy(() => import("@food/pages/restaurant/RestaurantOrdersEntry"))
const RestaurantOnboarding = lazy(() => import("@food/pages/restaurant/Onboarding"))
const PrivacyPolicyPage = lazy(() => import("@food/pages/restaurant/PrivacyPolicyPage"))
const TermsAndConditionsPage = lazy(() => import("@food/pages/restaurant/TermsAndConditionsPage"))
const MenuCategoriesPage = lazy(() => import("@food/pages/restaurant/MenuCategoriesPage"))
const RestaurantOffersPage = lazy(() => import("@food/pages/restaurant/RestaurantOffersPage"))
const RestaurantComplaintsEntry = lazy(() => import("@food/pages/restaurant/RestaurantComplaintsEntry"))
const RestaurantReviewsEntry = lazy(() => import("@food/pages/restaurant/RestaurantReviewsEntry"))
const RestaurantStatus = lazy(() => import("@food/pages/restaurant/RestaurantStatus"))
const ExploreMore = lazy(() => import("@food/pages/restaurant/ExploreMore"))
const DeliverySettings = lazy(() => import("@food/pages/restaurant/DeliverySettings"))
const RushHour = lazy(() => import("@food/pages/restaurant/RushHour"))
const OutletTimings = lazy(() => import("@food/pages/restaurant/OutletTimings"))
const DaySlots = lazy(() => import("@food/pages/restaurant/DaySlots"))
const OutletInfo = lazy(() => import("@food/pages/restaurant/OutletInfo"))
const RatingsReviews = lazy(() => import("@food/pages/restaurant/RatingsReviews"))
const EditOwner = lazy(() => import("@food/pages/restaurant/EditOwner"))
const EditCuisines = lazy(() => import("@food/pages/restaurant/EditCuisines"))
const EditRestaurantAddress = lazy(() => import("@food/pages/restaurant/EditRestaurantAddress"))
const Inventory = lazy(() => import("@food/pages/restaurant/Inventory"))
const Feedback = lazy(() => import("@food/pages/restaurant/Feedback"))
const ShareFeedback = lazy(() => import("@food/pages/restaurant/ShareFeedback"))
const DishRatings = lazy(() => import("@food/pages/restaurant/DishRatings"))
const RestaurantSupport = lazy(() => import("@food/pages/restaurant/RestaurantSupport"))
const FssaiDetails = lazy(() => import("@food/pages/restaurant/FssaiDetails"))
const FssaiUpdate = lazy(() => import("@food/pages/restaurant/FssaiUpdate"))
const Hyperpure = lazy(() => import("@food/pages/restaurant/Hyperpure"))
const ItemDetailsPage = lazy(() => import("@food/pages/restaurant/ItemDetailsPage"))
const HubFinance = lazy(() => import("@food/pages/restaurant/HubFinance"))
const FinanceDetailsPage = lazy(() => import("@food/pages/restaurant/FinanceDetailsPage"))
const WithdrawalHistoryPage = lazy(() => import("@food/pages/restaurant/WithdrawalHistoryPage"))
const PhoneNumbersPage = lazy(() => import("@food/pages/restaurant/PhoneNumbersPage"))
const DownloadReport = lazy(() => import("@food/pages/restaurant/DownloadReport"))

const ManageOutlets = lazy(() => import("@food/pages/restaurant/ManageOutlets"))
const UpdateBankDetails = lazy(() => import("@food/pages/restaurant/UpdateBankDetails"))
const ZoneSetup = lazy(() => import("@food/pages/restaurant/ZoneSetup"))
const DiningReservations = lazy(() => import("@food/pages/restaurant/DiningReservations"))
const Welcome = lazy(() => import("@food/pages/restaurant/auth/Welcome"))
const Login = lazy(() => import("@food/pages/restaurant/auth/Login"))
const OTP = lazy(() => import("@food/pages/restaurant/auth/OTP"))
const Signup = lazy(() => import("@food/pages/restaurant/auth/Signup"))
const ForgotPassword = lazy(() => import("@food/pages/restaurant/auth/ForgotPassword"))
const VerificationPending = lazy(() => import("@food/pages/restaurant/auth/VerificationPending"))

export default function RestaurantRouter() {
  return (
    <div className="restaurant-theme">
      <Suspense fallback={<Loader />}>
        <Routes>
        {/* Auth Routes */}
        <Route path="welcome" element={<Welcome />} />
        <Route path="login" element={<Login />} />
        <Route path="otp" element={<OTP />} />
        <Route path="signup" element={<Signup />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="pending-verification" element={<VerificationPending />} />

        {/* Protected Routes */}
        <Route
          element={
            <ProtectedRoute requiredRole="restaurant" loginPath="/food/restaurant/login">
              <RestaurantDesktopLayout />
            </ProtectedRoute>
          }
        >
          <Route path="" element={<RestaurantOrdersEntry />} />
          <Route path="orders" element={<RestaurantOrdersEntry />} />
          <Route path="orders/all" element={<RestaurantOrderHistoryEntry />} />
          <Route path="orders/:id" element={<OrderDetails />} />
          <Route path="notifications" element={<RestaurantNotifications />} />
          <Route path="delivery-settings" element={<DeliverySettings />} />
          <Route path="rush-hour" element={<RushHour />} />
          <Route path="menu-categories" element={<MenuCategoriesPage />} />
          <Route path="hub-menu" element={<Navigate to="/restaurant/inventory" replace />} />
          <Route path="offers" element={<RestaurantOffersPage />} />
          <Route path="customer-complaints" element={<RestaurantComplaintsEntry />} />
          <Route path="reviews" element={<RestaurantReviewsEntry />} />
          <Route path="status" element={<RestaurantStatus />} />
          <Route path="explore" element={<ExploreMore />} />
          <Route path="outlet-timings" element={<OutletTimings />} />
          <Route path="outlet-timings/:day" element={<DaySlots />} />
          <Route path="outlet-info" element={<OutletInfo />} />
          <Route path="ratings-reviews" element={<RatingsReviews />} />
          <Route path="edit-owner" element={<EditOwner />} />
          <Route path="edit-cuisines" element={<EditCuisines />} />
          <Route path="edit-address" element={<EditRestaurantAddress />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="feedback" element={<Feedback />} />
          <Route path="share-feedback" element={<ShareFeedback />} />
          <Route path="dish-ratings" element={<DishRatings />} />
          <Route path="help-centre/support" element={<RestaurantSupport />} />
          <Route path="fssai" element={<FssaiDetails />} />
          <Route path="fssai/update" element={<FssaiUpdate />} />
          <Route path="hyperpure" element={<Hyperpure />} />
          <Route path="hub-menu/item/:id" element={<ItemDetailsPage />} />
          <Route path="hub-finance" element={<HubFinance />} />
          <Route path="withdrawal-history" element={<WithdrawalHistoryPage />} />
          <Route path="finance-details" element={<FinanceDetailsPage />} />
          <Route path="phone" element={<PhoneNumbersPage />} />
          <Route path="download-report" element={<DownloadReport />} />
          <Route path="manage-outlets" element={<ManageOutlets />} />
          <Route path="update-bank-details" element={<UpdateBankDetails />} />
          <Route path="reservations" element={<DiningReservations />} />
          <Route path="zone-setup" element={<ZoneSetup />} />
        </Route>
        <Route path="onboarding" element={<RestaurantOnboarding />} />
        <Route path="privacy" element={<PrivacyPolicyPage />} />
        <Route path="terms" element={<TermsAndConditionsPage />} />
        </Routes>
      </Suspense>
    </div>
  )
}
