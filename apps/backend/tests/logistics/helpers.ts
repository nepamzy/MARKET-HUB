import request from "supertest";
import type { Express } from "express";
import { createOrderForNewBuyer } from "../commerce/helpers";

/** A checked-out order, confirmed by the seller — the minimum state a
 * Fulfillment can be created from. */
export async function createConfirmedOrder(
  app: Express,
  opts: { unitPriceMinor?: number; currency?: string; quantity?: number } = {}
) {
  const { buyer, seller, order } = await createOrderForNewBuyer(app, opts);
  const confirmRes = await request(app)
    .post(`/api/orders/${order.id}/confirm`)
    .set("Authorization", `Bearer ${seller.owner.accessToken}`);
  if (confirmRes.status !== 200) {
    throw new Error(`Order confirmation failed in test helper: ${confirmRes.status} ${JSON.stringify(confirmRes.body)}`);
  }
  return { buyer, seller, order };
}

/** Creates a confirmed order, its Fulfillment, and dispatches it (creating
 * the Delivery) — the minimum state Delivery/driver tests build on. */
export async function createDispatchedDelivery(
  app: Express,
  opts: { unitPriceMinor?: number; currency?: string; quantity?: number } = {}
) {
  const { buyer, seller, order } = await createConfirmedOrder(app, opts);

  const createRes = await request(app)
    .post(`/api/orders/${order.id}/fulfillment`)
    .set("Authorization", `Bearer ${seller.owner.accessToken}`);
  if (createRes.status !== 201) {
    throw new Error(`Fulfillment creation failed in test helper: ${createRes.status} ${JSON.stringify(createRes.body)}`);
  }
  const fulfillmentId = createRes.body.fulfillment.id as string;

  await request(app).post(`/api/fulfillments/${fulfillmentId}/start-processing`).set("Authorization", `Bearer ${seller.owner.accessToken}`);
  await request(app).post(`/api/fulfillments/${fulfillmentId}/pack`).set("Authorization", `Bearer ${seller.owner.accessToken}`);
  const dispatchRes = await request(app)
    .post(`/api/fulfillments/${fulfillmentId}/dispatch`)
    .set("Authorization", `Bearer ${seller.owner.accessToken}`)
    .send({
      recipientName: "Jane Receiver",
      recipientPhone: "+2348000000000",
      destinationAddressLine: "12 Example Street",
      destinationCity: "Lagos",
      destinationCountry: "Nigeria",
    });
  if (dispatchRes.status !== 200) {
    throw new Error(`Dispatch failed in test helper: ${dispatchRes.status} ${JSON.stringify(dispatchRes.body)}`);
  }

  const deliveryId = dispatchRes.body.fulfillment.delivery.id as string;
  return { buyer, seller, order, fulfillmentId, deliveryId };
}
