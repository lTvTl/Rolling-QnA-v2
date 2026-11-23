import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import RoomPage from './pages/RoomPage';
import RevealPage from './pages/RevealPage';

export default function App() {
    return (
        <div className="app-shell">
            <div className="bg-glow-orb orb-1" />
            <div className="bg-glow-orb orb-2" />
            <div className="bg-glow-orb orb-3" />

            <div className="app-container">
                <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/room/:inviteCode" element={<RoomPage />} />
                    <Route path="/room/:inviteCode/reveal" element={<RevealPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </div>
        </div>
    );
}
