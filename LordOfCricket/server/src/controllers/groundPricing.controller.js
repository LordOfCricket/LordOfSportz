import * as groundPricingService from '../services/groundPricing.service.js'

// req.ground is resolved + authorized by requireGroundPermission
// ('PRICING_VIEW'/'PRICING_MANAGE') before these ever run — see
// groundOwner.routes.js. req.params.publicGroundId is used only to look up
// WHICH ground; all authorization already happened in the middleware.

export async function listGroundPricingSlots(req, res, next) {
  try {
    const slots = await groundPricingService.listPricingSlots(req.ground)
    res.json({ slots })
  } catch (err) {
    next(err)
  }
}

export async function createGroundPricingSlot(req, res, next) {
  try {
    const { startTime, endTime, price } = req.body
    const slot = await groundPricingService.createPricingSlot(req.ground, { startTime, endTime, price }, req.user.id)
    res.status(201).json({ slot })
  } catch (err) {
    next(err)
  }
}

export async function updateGroundPricingSlot(req, res, next) {
  try {
    const { startTime, endTime, price, isActive } = req.body
    const slot = await groundPricingService.updatePricingSlot(req.ground, Number(req.params.slotId), { startTime, endTime, price, isActive }, req.user.id)
    res.json({ slot })
  } catch (err) {
    next(err)
  }
}

export async function deleteGroundPricingSlot(req, res, next) {
  try {
    await groundPricingService.deletePricingSlot(req.ground, Number(req.params.slotId), req.user.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}
