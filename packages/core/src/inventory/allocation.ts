import { availableToSell } from './projection.js';

export interface ReservationRequest {
  onHand: number;
  allocated: number;
  reserved: number;
  requestedQty: number;
}

export interface ReservationResult {
  ok: boolean;
  /** How many units could be reserved (0 when blocked). */
  granted: number;
  available: number;
  reason?: 'INSUFFICIENT_AVAILABLE';
}

/**
 * Decide whether a channel reservation can be granted without overselling. The API layer
 * runs this inside a `SELECT ... FOR UPDATE` transaction so two concurrent orders for the
 * last unit cannot both succeed. All-or-nothing: partial reservations are rejected so the
 * order layer can decide explicitly rather than silently shorting a customer.
 */
export function evaluateReservation(req: ReservationRequest): ReservationResult {
  const available = availableToSell(req.onHand, req.allocated, req.reserved);
  if (req.requestedQty <= available) {
    return { ok: true, granted: req.requestedQty, available };
  }
  return { ok: false, granted: 0, available, reason: 'INSUFFICIENT_AVAILABLE' };
}
