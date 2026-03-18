const mongoose = require('mongoose')
const Node = require('./models/Node')

mongoose.connect('mongodb://localhost:27017/indoornav')

async function rescale() {
  // FB nodes: placed on 4642x3924, actual image is 1111x912
  const fbScaleX = 1111 / 4642
  const fbScaleY = 912 / 3924

  // S nodes: placed on 4642x3924, actual image is 681x852
  const sScaleX = 681 / 4642
  const sScaleY = 852 / 3924

  const fbNodes = await Node.find({ floor: 2 })
  console.log(`Rescaling ${fbNodes.length} FB nodes...`)
  for (const node of fbNodes) {
    await Node.findByIdAndUpdate(node._id, {
      x: Math.round(node.x * fbScaleX),
      y: Math.round(node.y * fbScaleY),
    })
  }

  const sNodes = await Node.find({ floor: 3 })
  console.log(`Rescaling ${sNodes.length} S nodes...`)
  for (const node of sNodes) {
    await Node.findByIdAndUpdate(node._id, {
      x: Math.round(node.x * sScaleX),
      y: Math.round(node.y * sScaleY),
    })
  }

  console.log('✅ Done!')
  mongoose.disconnect()
}

rescale().catch(console.error)