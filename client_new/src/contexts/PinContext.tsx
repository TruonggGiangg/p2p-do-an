import React, { createContext, useContext, useState, useCallback } from 'react';

interface PinContextValue {
    /** PIN đã được xác thực trong phiên này chưa */
    pinVerified: boolean;
    /** Đánh dấu đã xác thực PIN */
    markPinVerified: () => void;
    /** Reset trạng thái (khi logout) */
    resetPinVerified: () => void;
}

const PinContext = createContext<PinContextValue>({
    pinVerified: false,
    markPinVerified: () => { },
    resetPinVerified: () => { },
});

export function PinProvider({ children }: { children: React.ReactNode }) {
    const [pinVerified, setPinVerified] = useState(false);

    const markPinVerified = useCallback(() => setPinVerified(true), []);
    const resetPinVerified = useCallback(() => setPinVerified(false), []);

    return (
        <PinContext.Provider value={{ pinVerified, markPinVerified, resetPinVerified }}>
            {children}
        </PinContext.Provider>
    );
}

export function usePin() {
    return useContext(PinContext);
}
