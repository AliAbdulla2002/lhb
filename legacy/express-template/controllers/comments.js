const express = require("express")
const Hoot = require("../models/hoot.js")

const create = async (req, res) => {
  try {
    req.body.author = req.user._id
    const hoot = await Hoot.findById(req.params.hootId)
    hoot.comments.push(req.body)
    await hoot.save()

    // Find the newly created comment:
    const newComment = hoot.comments[hoot.comments.length - 1]

    newComment._doc.author = req.user

    // Respond with the newComment:
    res.status(201).json(newComment)
  } catch (err) {
    res.status(500).json({ err: err.message })
  }
}

const update = async (req, res) => {
  try {
    const hoot = await Hoot.findById(req.params.hootId)
    const comment = hoot.comments.id(req.params.commentId)

    // ensures the current user is the author of the comment
    if (comment.author.toString() !== req.user._id) {
      return res
        .status(403)
        .json({ message: "You are not authorized to edit this comment" })
    }

    comment.text = req.body.text
    await hoot.save()
    res.status(200).json({ message: "Comment updated successfully" })
  } catch (err) {
    res.status(500).json({ err: err.message })
  }
}
const deleteComment = async (req, res) => {
  try {
    const hoot = await Hoot.findById(req.params.hootId)
    const comment = hoot.comments.id(req.params.commentId)

    // ensures the current user is the author of the comment
    if (comment.author.toString() !== req.user._id) {
      return res
        .status(403)
        .json({ message: "You are not authorized to edit this comment" })
    }

    hoot.comments.remove({ _id: req.params.commentId })
    await hoot.save()
    res.status(200).json({ message: "Comment deleted successfully" })
  } catch (err) {
    res.status(500).json({ err: err.message })
  }
}

module.exports = {
    create,
    update,
    deleteComment,
}