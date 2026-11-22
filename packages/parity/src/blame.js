function isDiffPixel(data, index) {
  // pixelmatch paints mismatches in red; ignore near-black leftover pixels.
  const offset = index * 4
  return data[offset] > 40 && data[offset] > data[offset + 1] + 20
}

function contains(box, x, y) {
  if (!box) return false
  return x >= box.x && y >= box.y && x < box.x + box.width && y < box.y + box.height
}

export function blamePixels(diffImage, sections) {
  if (!diffImage || !Array.isArray(sections) || sections.length === 0) return []
  const counts = new Map(sections.map((section) => [section.id, { ...section, mismatched: 0 }]))
  let total = 0
  for (let y = 0; y < diffImage.height; y += 1) {
    for (let x = 0; x < diffImage.width; x += 1) {
      const index = y * diffImage.width + x
      if (!isDiffPixel(diffImage.data, index)) continue
      total += 1
      for (const section of sections) {
        if (contains(section.box, x, y) && counts.has(section.id)) {
          counts.get(section.id).mismatched += 1
        }
      }
    }
  }
  return [...counts.values()]
    .map((item) => ({
      id: item.id,
      selector: item.selector,
      mismatched: item.mismatched,
      share: total === 0 ? 0 : item.mismatched / total,
    }))
    .sort((left, right) => right.mismatched - left.mismatched)
}

export function worstSection(sectionResults) {
  if (!Array.isArray(sectionResults) || sectionResults.length === 0) return null
  const ranked = [...sectionResults].sort((left, right) => {
    const leftScore = left.score ?? (left.pass ? 1 : 0)
    const rightScore = right.score ?? (right.pass ? 1 : 0)
    if (left.pass !== right.pass) return left.pass ? 1 : -1
    return leftScore - rightScore
  })
  return ranked[0]
}
