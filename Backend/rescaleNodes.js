const mongoose = require('mongoose')
const Node = require('./models/Node')

mongoose.connect('mongodb://localhost:27017/indoornav')

async function rescale() {
  // FA nodes: placed on 4642x3924 canvas, actual image is 1742x2442
  const scaleX = 1742 / 4642  // = 0.375
  const scaleY = 2442 / 3924  // = 0.622

  const nodes = await Node.find({ floor: 1 })
  console.log(`Rescaling ${nodes.length} FA nodes...`)

  for (const node of nodes) {
    await Node.findByIdAndUpdate(node._id, {
      x: Math.round(node.x * scaleX),
      y: Math.round(node.y * scaleY),
    })
  }

  console.log('✅ Done!')
  mongoose.disconnect()
}

rescale().catch(console.error)