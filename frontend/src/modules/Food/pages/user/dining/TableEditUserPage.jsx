import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, User, Phone, Mail, CheckCircle2 } from 'lucide-react';
import AnimatedPage from "@food/components/user/AnimatedPage";

export default function TableEditUserPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, restaurant, guests, date, timeSlot, discount, specialRequest } = location.state || {};
    
    const [name, setName] = useState(user?.name || "");
    const [phone, setPhone] = useState(user?.phone || "");
    const [email, setEmail] = useState(user?.email || "");

    const handleSave = () => {
        // Go back to confirmation with updated user
        navigate("/food/user/dining/book-confirmation", {
            state: {
                restaurant,
                guests,
                date,
                timeSlot,
                discount,
                specialRequest,
                user: { ...user, name, phone, email }
            },
            replace: true
        });
    };

    return (
        <AnimatedPage className="min-h-screen bg-[#f8f9fa] pb-20">
            {/* Header */}
            <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100">
                <div className="max-w-lg mx-auto px-4 h-16 flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-900 active:scale-90 transition-all">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">Edit Details</h1>
                </div>
            </div>

            <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
                <div className="text-center space-y-2">
                    <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100 shadow-sm">
                        <User className="w-8 h-8" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800">Personalize Booking</h2>
                    <p className="text-sm text-slate-500 font-medium">Contact details for the restaurant</p>
                </div>

                <div className="space-y-5">
                    {/* Name Input */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600 ml-1">Full Name</label>
                        <div className="relative">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                                <User className="w-4 h-4" />
                            </div>
                            <input 
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Enter your full name"
                                className="w-full h-12 pl-11 pr-4 bg-white border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-slate-400"
                            />
                        </div>
                    </div>

                    {/* Email Input */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600 ml-1">Email Address</label>
                        <div className="relative">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                                <Mail className="w-4 h-4" />
                            </div>
                            <input 
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter email address"
                                className="w-full h-12 pl-11 pr-4 bg-white border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-slate-400"
                            />
                        </div>
                    </div>

                    {/* Phone Input */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600 ml-1">Mobile Number</label>
                        <div className="relative">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                                <Phone className="w-4 h-4" />
                            </div>
                            <input 
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="Enter mobile number"
                                className="w-full h-12 pl-11 pr-4 bg-white border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-slate-400"
                            />
                        </div>
                    </div>
                </div>

                <div className="pt-8 space-y-3">
                    <button 
                        onClick={handleSave}
                        className="w-full h-12 bg-[#2A9C64] hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm shadow-md shadow-emerald-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        <CheckCircle2 className="w-4 h-4" />
                        Save Details
                    </button>
                    <button 
                        onClick={() => navigate(-1)}
                        className="w-full h-12 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </AnimatedPage>
    );
}
