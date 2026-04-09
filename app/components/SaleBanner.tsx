"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useRealtime } from "@/app/components/RealtimeProvider";

const DISMISS_AFTER_MS = 5000;

function formatProgram(programa: string): string {
  const map: Record<string, string> = {
    roms_7: "ROMS 7",
    consultoria: "Consultoría",
    omnipresencia: "Omnipresencia",
    multicuentas: "Multicuentas",
  };
  return map[programa] ?? programa;
}

function formatUSD(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function playNotificationSound() {
  try {
    const audioCtx = new (window.AudioContext || (window as unknown as Record<string, typeof AudioContext>).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // Rising tone: C5 -> E5 -> G5
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
    oscillator.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.15); // E5
    oscillator.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.3); // G5

    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.6);
  } catch {
    // Web Audio API not available — silent fail
  }
}

export default function SaleBanner() {
  const { saleBannerQueue, dismissSale } = useRealtime();
  const [currentSale, setCurrentSale] = useState<(typeof saleBannerQueue)[0] | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundPlayedRef = useRef<Set<string>>(new Set());

  const dismissCurrent = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => {
      if (currentSale) {
        dismissSale(currentSale.id);
      }
      setCurrentSale(null);
    }, 300); // wait for slide-out animation
  }, [currentSale, dismissSale]);

  // Pick the next sale from the queue
  useEffect(() => {
    if (currentSale || saleBannerQueue.length === 0) return;

    const next = saleBannerQueue[0];
    setCurrentSale(next);

    // Play sound only once per sale
    if (!soundPlayedRef.current.has(next.id)) {
      soundPlayedRef.current.add(next.id);
      playNotificationSound();
    }

    // Animate in
    requestAnimationFrame(() => {
      setIsVisible(true);
    });

    // Auto-dismiss
    timerRef.current = setTimeout(() => {
      dismissCurrent();
    }, DISMISS_AFTER_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [saleBannerQueue, currentSale, dismissCurrent]);

  if (!currentSale) return null;

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        isVisible ? "translate-y-0 opacity-100 animate-slide-in-right" : "-translate-y-full opacity-0"
      }`}
    >
      <div
        className="bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 text-white rounded-xl shadow-2xl px-6 py-4 flex items-center gap-4 min-w-[300px] md:min-w-[400px] max-w-[calc(100vw-2rem)] md:max-w-[600px] cursor-pointer"
        onClick={dismissCurrent}
      >
        <span className="text-3xl animate-bounce">{"\uD83D\uDE80"}</span>
        <div className="flex-1">
          <p className="font-bold text-lg leading-tight">
            {currentSale.closer_name} cerro a {currentSale.lead_name}
          </p>
          <p className="text-purple-100 text-sm">
            {formatProgram(currentSale.programa)} &mdash; {formatUSD(currentSale.ticket_total)}
          </p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            dismissCurrent();
          }}
          className="text-purple-200 hover:text-white transition-colors text-xl font-bold"
        >
          &times;
        </button>
      </div>
      {/* Queue indicator */}
      {saleBannerQueue.length > 1 && (
        <div className="text-center mt-1">
          <span className="text-xs text-gray-500 bg-white/80 rounded-full px-2 py-0.5">
            +{saleBannerQueue.length - 1} mas
          </span>
        </div>
      )}
    </div>
  );
}
