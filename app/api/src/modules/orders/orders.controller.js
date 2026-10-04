const ordersService = require('./orders.service');

async function getById(req, res, next) {
  try {
    const order = await ordersService.getOrderById(req.params.id, req.user.id);
    return res.status(200).json({ order });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getById };
