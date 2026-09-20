import * as followService from '../services/follow.service.js'

export async function followPlayerHandler(req, res, next) {
  try {
    res.json(await followService.followPlayer(req.user.id, req.params.publicPlayerId))
  } catch (err) {
    next(err)
  }
}

export async function unfollowPlayerHandler(req, res, next) {
  try {
    res.json(await followService.unfollowPlayer(req.user.id, req.params.publicPlayerId))
  } catch (err) {
    next(err)
  }
}

export async function playerFollowStateHandler(req, res, next) {
  try {
    res.json(await followService.getPlayerFollowState(req.user.id, req.params.publicPlayerId))
  } catch (err) {
    next(err)
  }
}

export async function followTeamHandler(req, res, next) {
  try {
    res.json(await followService.followTeam(req.user.id, req.params.id))
  } catch (err) {
    next(err)
  }
}

export async function unfollowTeamHandler(req, res, next) {
  try {
    res.json(await followService.unfollowTeam(req.user.id, req.params.id))
  } catch (err) {
    next(err)
  }
}

export async function teamFollowStateHandler(req, res, next) {
  try {
    res.json(await followService.getTeamFollowState(req.user.id, req.params.id))
  } catch (err) {
    next(err)
  }
}

export async function followGroundHandler(req, res, next) {
  try {
    res.json(await followService.followGround(req.user.id, req.params.publicGroundId))
  } catch (err) {
    next(err)
  }
}

export async function unfollowGroundHandler(req, res, next) {
  try {
    res.json(await followService.unfollowGround(req.user.id, req.params.publicGroundId))
  } catch (err) {
    next(err)
  }
}

export async function groundFollowStateHandler(req, res, next) {
  try {
    res.json(await followService.getGroundFollowState(req.user.id, req.params.publicGroundId))
  } catch (err) {
    next(err)
  }
}

export async function listFollowingHandler(req, res, next) {
  try {
    res.json(
      await followService.listFollowing(req.user.id, {
        playersLimit: req.query.playersLimit,
        playersOffset: req.query.playersOffset,
        teamsLimit: req.query.teamsLimit,
        teamsOffset: req.query.teamsOffset,
        groundsLimit: req.query.groundsLimit,
        groundsOffset: req.query.groundsOffset,
      })
    )
  } catch (err) {
    next(err)
  }
}
