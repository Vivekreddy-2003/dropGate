/**
 * DROPS CONTROLLER
 */

const dropsService = require('./drops.service');
const waitingRoomService = require('../waiting-room/waiting-room.service');
const { createDropSchema } = require('./drops.validation');

async function listPublic(req, res, next) {
  try {
    const result = await dropsService.listPublicDrops();
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function getBySlug(req, res, next) {
  try {
    const result = await dropsService.getDropBySlug(req.params.slug);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function listMine(req, res, next) {
  try {
    const result = await dropsService.listMyDrops(req.user.id);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function create(req, res, next) {
  try {
    const body = createDropSchema.parse(req.body);
    const result = await dropsService.createDrop(req.user.id, body);
    return res.status(201).json(result);
  } catch (err) {
    return next(err);
  }
}

async function getAdmin(req, res, next) {
  try {
    const result = await dropsService.getAdminSnapshot(req.params.id, req.user.id);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function schedule(req, res, next) {
  try {
    const drop = await dropsService.scheduleDrop(req.params.id, req.user.id);
    return res.status(200).json({ drop });
  } catch (err) {
    return next(err);
  }
}

async function goLive(req, res, next) {
  try {
    const result = await dropsService.goLiveDrop(req.params.id, req.user.id);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function joinWaitingRoom(req, res, next) {
  try {
    const result = await waitingRoomService.joinWaitingRoom(req.params.id, req.user.id);
    return res.status(201).json(result);
  } catch (err) {
    return next(err);
  }
}

async function getWaitingRoomMe(req, res, next) {
  try {
    const result = await waitingRoomService.getMyEntry(req.params.id, req.user.id);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listPublic,
  getBySlug,
  listMine,
  create,
  getAdmin,
  schedule,
  goLive,
  joinWaitingRoom,
  getWaitingRoomMe,
};
