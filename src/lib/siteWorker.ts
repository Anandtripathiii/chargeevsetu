// Runs the greedy site optimiser off the main thread so sliders and first paint stay responsive.
import { greedySites, type Cell } from './model'

self.onmessage = (e: MessageEvent<{ id: number; cells: Cell[]; n: number; size: number; ratio: number }>) => {
  const { id, cells, n, size, ratio } = e.data
  self.postMessage({ id, res: greedySites(cells, n, size, ratio) })
}
