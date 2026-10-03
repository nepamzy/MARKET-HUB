import { Router } from "express";
import { addCartItemSchema, updateCartItemSchema } from "@market-hub/shared";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { addCartItem, clearCart, getCartView, removeCartItem, updateCartItemQuantity } from "./cart.service";

/**
 * Mounted at /api/cart — scoped entirely to the authenticated caller, never
 * to a URL-supplied user or organization id (a cart is personal, not
 * organization-owned — see schema.prisma's Cart doc comment).
 */
export const cartRouter = Router();

cartRouter.use(requireAuth);

cartRouter.get("/", async (req, res, next) => {
  try {
    res.status(200).json(await getCartView(req.user!.id));
  } catch (err) {
    next(err);
  }
});

cartRouter.post("/items", validate(addCartItemSchema), async (req, res, next) => {
  try {
    res.status(201).json(await addCartItem(req.user!.id, req.body.productId, req.body.quantity));
  } catch (err) {
    next(err);
  }
});

cartRouter.patch("/items/:itemId", validate(updateCartItemSchema), async (req, res, next) => {
  try {
    res.status(200).json(await updateCartItemQuantity(req.user!.id, req.params.itemId, req.body.quantity));
  } catch (err) {
    next(err);
  }
});

cartRouter.delete("/items/:itemId", async (req, res, next) => {
  try {
    res.status(200).json(await removeCartItem(req.user!.id, req.params.itemId));
  } catch (err) {
    next(err);
  }
});

cartRouter.delete("/", async (req, res, next) => {
  try {
    res.status(200).json(await clearCart(req.user!.id));
  } catch (err) {
    next(err);
  }
});
