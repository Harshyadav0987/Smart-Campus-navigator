const router = require('express').Router();
const Node = require('../models/Node');
const Edge = require('../models/Edge');
const dijkstra = require('../dijkstra');

// get all nodes
router.get('/', async (req, res) => {
  const nodes = await Node.find();
  res.json(nodes);
});

// get nodes by floor
router.get('/floor/:floor', async (req, res) => {
  const nodes = await Node.find({ floor: req.params.floor });
  res.json(nodes);
});

// add a new node
router.post('/', async (req, res) => {
  try {
    const node = new Node(req.body);
    await node.save();
    res.json(node);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// delete a node
router.delete('/', async (req, res) => {
  const id = req.query.id
  await Node.findOneAndDelete({ id })
  res.json({ message: 'Node deleted' })
})

// GET /api/nodes/navigate?from=J014&to=J025
router.get('/navigate', async (req, res) => {
  const { from, to } = req.query

  if (!from || !to) {
    return res.status(400).json({ error: "Provide from and to node IDs" })
  }

  try {
    const nodes = await Node.find()
    const edges = await Edge.find()
    const path = dijkstra(nodes, edges, from, to)

    if (!path) {
      return res.status(404).json({ error: "No path found" })
    }

    const pathNodes = path.map(id => nodes.find(n => n.id === id))
    res.json({ path, pathNodes })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router;