import { BrowserRouter, Route, Routes } from 'react-router-dom'
import CheckoutPage from './pages/CheckoutPage.jsx'
import ConfirmationPage from './pages/ConfirmationPage.jsx'
import DropPage from './pages/DropPage.jsx'
import HomePage from './pages/HomePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import MerchantCreateDropPage from './pages/MerchantCreateDropPage.jsx'
import MerchantDashboardPage from './pages/MerchantDashboardPage.jsx'
import MerchantDropPage from './pages/MerchantDropPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import WaitingRoomPage from './pages/WaitingRoomPage.jsx'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route path="/" element={<HomePage />} />
        <Route path="/drops/:slug" element={<DropPage />} />
        <Route path="/drops/:slug/waiting" element={<WaitingRoomPage />} />
        <Route path="/drops/:slug/checkout" element={<CheckoutPage />} />
        <Route path="/orders/success" element={<ConfirmationPage />} />

        <Route path="/merchant" element={<MerchantDashboardPage />} />
        <Route path="/merchant/drops/new" element={<MerchantCreateDropPage />} />
        <Route path="/merchant/drops/:id" element={<MerchantDropPage />} />
      </Routes>
    </BrowserRouter>
  )
}
