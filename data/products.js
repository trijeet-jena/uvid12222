/* ============================================================
   UVID — catalog data
   categories · products · coupons · review pool
   Images are generated as inline SVG data-URIs (no binaries needed).
   ============================================================ */

(function () {
  "use strict";

  /* ---------- placeholder product art (SVG data URI) ---------- */
  function art(emoji, bg, ink) {
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">' +
      '<defs><pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse">' +
      '<path d="M40 0H0v40" fill="none" stroke="' + ink + '" stroke-opacity="0.13" stroke-width="1"/></pattern></defs>' +
      '<rect width="640" height="640" fill="' + bg + '"/>' +
      '<rect width="640" height="640" fill="url(#g)"/>' +
      '<circle cx="320" cy="308" r="188" fill="#ffffff" fill-opacity="0.55"/>' +
      '<text x="320" y="392" font-size="220" text-anchor="middle">' + emoji + '</text>' +
      '</svg>';
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }

  /* ---------- categories ---------- */
  var CATEGORIES = [
    { slug: "pens",      label: "Pens & Writing",   emoji: "🖊️", blurb: "Gel, ball, fountain & fineliners" },
    { slug: "notebooks", label: "Notebooks",        emoji: "📒", blurb: "Journals, registers & hardbounds" },
    { slug: "office",    label: "Office Supplies",  emoji: "📎", blurb: "Files, staplers & desk extras" },
    { slug: "art",       label: "Art & Craft",      emoji: "🎨", blurb: "Paints, pencils & canvas" },
    { slug: "desk",      label: "Desk Accessories", emoji: "🗂️", blurb: "Organisers, stands & clips" },
    { slug: "school",    label: "School Essentials",emoji: "✏️", blurb: "Geometry, labels & kits" },
    { slug: "planners",  label: "Planners",         emoji: "🗓️", blurb: "Plan the year, one page a day" },
    { slug: "resin-moulds", label: "Resin Moulds", emoji: "🌸", blurb: "Moulds for resin art and handmade projects" },
    { slug: "candle-making", label: "Candle Making", emoji: "🕯️", blurb: "Decorative moulds and supplies for handmade candles" }
  ];

  /* ---------- products ---------- */
  var P = [
    { id: "gel-trio",        name: "GlideWrite Gel Pen Trio (0.7mm, Blue)", brand: "GlideWrite", category: "pens",      price: 149, mrp: 220, rating: 4.5, ratingCount: 2314, emoji: "🖊️", bg: "#EEF2FF", ink: "#4C5BD4", stock: 40, tags: ["bestseller"],
      highlights: ["Smooth-flow German tip, no skips", "Quick-dry ink — no smudges", "Comfort grip for long writing", "Pack of 3 + 1 free refill"],
      specs: { "Ink Colour": "Blue", "Tip Size": "0.7 mm", "Pack": "3 pens + refill", "Refillable": "Yes" } },
    { id: "fountain-classic",name: "Inkwell Fountain Pen — Classic",        brand: "Inkwell",    category: "pens",      price: 349, mrp: 499, rating: 4.6, ratingCount: 876,  emoji: "🖋️", bg: "#FDF2E9", ink: "#C77B30", stock: 18, tags: ["premium"],
      highlights: ["Iridium fine nib, glass-smooth", "Brass barrel with matte lacquer", "Includes converter + 2 cartridges", "Gift-box packing"],
      specs: { "Nib": "Fine (F)", "Body": "Brass", "Filling": "Converter + cartridge", "Weight": "24 g" } },
    { id: "fineliner-12",    name: "Doodle Fineliner Set — 12 Shades",      brand: "Doodle",     category: "pens",      price: 259, mrp: 399, rating: 4.7, ratingCount: 1502, emoji: "🖌️", bg: "#F3E8FF", ink: "#8B47C9", stock: 33, tags: ["bestseller", "deal"],
      highlights: ["12 vibrant archival colours", "0.4 mm felt tips, bleed-proof", "Perfect for journaling & doodles", "Colour-coded caps"],
      specs: { "Colours": "12", "Tip": "0.4 mm", "Ink": "Water-based", "Use": "Journals, planners" } },
    { id: "ballpoint-25",    name: "Scriptora Ballpoint Jar (25 pcs)",      brand: "Scriptora",  category: "pens",      price: 399, mrp: 599, rating: 4.3, ratingCount: 445,  emoji: "🖊️", bg: "#E8F5EE", ink: "#2E8B57", stock: 25, tags: ["value"],
      highlights: ["Office-jar pack of 25", "1.0 mm medium tip", "Long-lasting ink tank", "Blue + black mix"],
      specs: { "Pack": "25 pens", "Tip": "1.0 mm", "Ink": "Blue / Black", "Use": "Office & bulk" } },

    { id: "dotted-journal",  name: "PaperMuse Dotted Journal A5",           brand: "PaperMuse",  category: "notebooks", price: 299, mrp: 450, rating: 4.8, ratingCount: 3208, emoji: "📓", bg: "#FFF1F0", ink: "#D4574E", stock: 50, tags: ["bestseller"],
      highlights: ["160 gsm dot-grid, zero bleed", "Lay-flat sewn binding", "Elastic closure + ribbon", "Bullet-journal favourite"],
      specs: { "Size": "A5", "Pages": "192", "Ruling": "Dot grid 5 mm", "Binding": "Sewn lay-flat" } },
    { id: "spiral-200",      name: "NoteNest Spiral Register — 200 Pages",  brand: "NoteNest",   category: "notebooks", price: 119, mrp: 180, rating: 4.4, ratingCount: 980,  emoji: "📔", bg: "#EAF4FF", ink: "#3E7CC2", stock: 60, tags: [],
      highlights: ["Single-line ruling, 70 gsm", "Sturdy twin-wire spiral", "Laminated soft cover", "Great for lectures & notes"],
      specs: { "Size": "Single line 21×29 cm", "Pages": "200", "Binding": "Spiral", "GSM": "70" } },
    { id: "hardbound-240",   name: "PaperMuse Hardbound Ruled — 240 Pages", brand: "PaperMuse",  category: "notebooks", price: 189, mrp: 260, rating: 4.6, ratingCount: 1105, emoji: "📕", bg: "#F0FFF4", ink: "#38A169", stock: 45, tags: [],
      highlights: ["Premium hardback cover", "Foolscap ruled pages", "Opens flat for neat notes", "Index page + date box"],
      specs: { "Size": "Foolscap", "Pages": "240", "Ruling": "Ruled", "Binding": "Hardbound" } },
    { id: "sticky-trio",     name: "NoteNest Sticky Notes Combo (3 Pads)",  brand: "NoteNest",   category: "notebooks", price: 99,  mrp: 150, rating: 4.2, ratingCount: 620,  emoji: "🗒️", bg: "#FFFBEA", ink: "#D4A017", stock: 80, tags: ["deal"],
      highlights: ["3 pads — 76×76 mm, 100 sheets", "Pastel assortment", "Re-sticks without residue", "Perfect page markers"],
      specs: { "Pads": "3", "Sheets": "100 per pad", "Size": "76×76 mm", "Colours": "Pastel mix" } },

    { id: "stapler-hd",      name: "ClipWorks Heavy-Duty Stapler",          brand: "ClipWorks",  category: "office",    price: 289, mrp: 420, rating: 4.4, ratingCount: 530,  emoji: "📎", bg: "#EDF0F7", ink: "#5A6B8C", stock: 22, tags: [],
      highlights: ["Staples up to 40 sheets", "Full-strip, metal body", "Anti-slip base", "Free 1000 staples included"],
      specs: { "Capacity": "40 sheets", "Type": "Full strip", "Body": "Metal", "Includes": "1000 staples" } },
    { id: "folder-10",       name: "ClipWorks File Folders (Pack of 10)",   brand: "ClipWorks",  category: "office",    price: 199, mrp: 299, rating: 4.2, ratingCount: 388,  emoji: "🗂️", bg: "#FFF4EC", ink: "#C56B34", stock: 35, tags: ["value"],
      highlights: ["A4 lever-arch clip folders", "Spine label window", "Fits 100 sheets each", "Assorted pastel spines"],
      specs: { "Pack": "10 folders", "Size": "A4", "Capacity": "100 sheets", "Type": "Clip file" } },
    { id: "kraft-envelopes", name: "Scriptora Kraft Envelopes (Set of 20)", brand: "Scriptora",  category: "office",    price: 129, mrp: 199, rating: 4.1, ratingCount: 210,  emoji: "✉️", bg: "#F6F1E7", ink: "#8C7B54", stock: 40, tags: [],
      highlights: ["Textured kraft paper", "Peel-and-seal strip", "Fits A5 invitations", "Letter-writing ready"],
      specs: { "Pack": "20", "Size": "16×23 cm", "Paper": "Kraft 120 gsm", "Seal": "Peel & stick" } },
    { id: "wbmarkers-4",     name: "GlideWrite Whiteboard Markers (4)",     brand: "GlideWrite", category: "office",    price: 179, mrp: 250, rating: 4.5, ratingCount: 296,  emoji: "🖍️", bg: "#EAF6FF", ink: "#2E86C1", stock: 28, tags: [],
      highlights: ["Low-odour dry-erase ink", "Chisel tip — broad or fine", "Erases cleanly, no ghosting", "4 assorted colours"],
      specs: { "Pack": "4 markers", "Tip": "Chisel", "Ink": "Dry-erase", "Colours": "Blk/Blu/Red/Grn" } },

    { id: "watercolor-24",   name: "ArtBerry Watercolour Cakes — 24",       brand: "ArtBerry",   category: "art",       price: 449, mrp: 650, rating: 4.7, ratingCount: 1240, emoji: "🎨", bg: "#FDEFF6", ink: "#C2508B", stock: 20, tags: ["bestseller", "deal"],
      highlights: ["24 artist-grade pigments", "Includes brush pen + palette", "Blends beautifully on 200 gsm", "Metal tin case"],
      specs: { "Colours": "24", "Type": "Semi-moist cakes", "Includes": "Brush + tin", "Level": "Beginner → artist" } },
    { id: "sketch-12",       name: "ArtBerry Sketch Pencils (12B–6H)",      brand: "ArtBerry",   category: "art",       price: 229, mrp: 320, rating: 4.6, ratingCount: 861,  emoji: "✏️", bg: "#F2F2F2", ink: "#4A4A4A", stock: 30, tags: [],
      highlights: ["Full tonal range 12B–6H", "Break-resistant graphite", "Pre-sharpened, cedar wood", "Includes eraser + sharpener"],
      specs: { "Set": "12 pencils", "Range": "12B to 6H", "Wood": "Cedar", "Extras": "Eraser, sharpener" } },
    { id: "acrylic-12",      name: "Doodle Acrylic Paint Set — 12 Tubes",   brand: "Doodle",     category: "art",       price: 399, mrp: 560, rating: 4.5, ratingCount: 470,  emoji: "🧴", bg: "#E9FBEF", ink: "#27AE60", stock: 26, tags: [],
      highlights: ["12 × 12 ml rich pigments", "Dries fast, water-resistant", "Works on canvas, wood, paper", "Student & hobby grade"],
      specs: { "Colours": "12", "Volume": "12 ml each", "Base": "Water", "Surface": "Multi-surface" } },
    { id: "canvas-pack",     name: "ArtBerry Canvas Boards (Pack of 4)",    brand: "ArtBerry",   category: "art",       price: 349, mrp: 499, rating: 4.4, ratingCount: 355,  emoji: "🖼️", bg: "#FBF3E4", ink: "#B08A3E", stock: 19, tags: [],
      highlights: ["Triple-primed cotton surface", "Sturdy MDF backing", "Two 8×10\" + two 6×8\" boards", "Acrylic & oil compatible"],
      specs: { "Pack": "4 boards", "Sizes": "8×10 in, 6×8 in", "Surface": "Cotton, primed", "Use": "Acrylic / oil" } },

    { id: "desk-organiser",  name: "PaperMuse Bamboo Desk Organiser",       brand: "PaperMuse",  category: "desk",      price: 599, mrp: 899, rating: 4.5, ratingCount: 712,  emoji: "🗃️", bg: "#F5EFE3", ink: "#9C7A3C", stock: 15, tags: ["premium"],
      highlights: ["5 compartments + phone slot", "Solid bamboo, hand-finished", "Fits pens, notes, gadgets", "Anti-scratch felt base"],
      specs: { "Material": "Bamboo", "Compartments": "5 + 1", "Size": "22×10×9 cm", "Assembly": "None" } },
    { id: "mag-clips-6",     name: "ClipWorks Magnetic Clips (6 Pack)",     brand: "ClipWorks",  category: "desk",      price: 149, mrp: 220, rating: 4.3, ratingCount: 288,  emoji: "🧲", bg: "#EFF4FB", ink: "#5D6D9E", stock: 44, tags: [],
      highlights: ["Holds 25+ sheets on fridges", "Neodymium magnets", "Powder-coated steel", "6 bright colours"],
      specs: { "Pack": "6", "Hold": "~25 sheets", "Magnet": "Neodymium", "Finish": "Powder coat" } },
    { id: "pen-stand",       name: "NoteNest Rotating Pen Stand",           brand: "NoteNest",   category: "desk",      price: 349, mrp: 500, rating: 4.2, ratingCount: 198,  emoji: "🪄", bg: "#F3ECFB", ink: "#7E57C2", stock: 27, tags: [],
      highlights: ["360° smooth rotation", "4 dividable compartments", "Recycled ABS body", "Fits 60+ pens"],
      specs: { "Rotation": "360°", "Sections": "4", "Material": "Recycled ABS", "Capacity": "60+ pens" } },

    { id: "geometry-box",    name: "PaperMuse Geometry Box",                brand: "PaperMuse",  category: "school",    price: 179, mrp: 250, rating: 4.4, ratingCount: 505,  emoji: "📐", bg: "#EAF7F4", ink: "#2C8C7D", stock: 38, tags: ["bestseller"],
      highlights: ["Precision steel compass", "Protractor, set squares, scale", "Clutch pencil + leads", "Metal clamp-lock case"],
      specs: { "Instruments": "9 pieces", "Case": "Metal", "Compass": "Precision steel", "For": "Class 6+" } },
    { id: "school-labels",   name: "NoteNest School Labels (60 pcs)",       brand: "NoteNest",   category: "school",    price: 59,  mrp: 99,  rating: 4.1, ratingCount: 240,  emoji: "🏷️", bg: "#FFF0F3", ink: "#C94F6D", stock: 90, tags: ["value"],
      highlights: ["60 write-on name labels", "Water & smear resistant", "Books, bottles, lunchboxes", "Assorted sizes"],
      specs: { "Count": "60", "Sizes": "3 sizes", "Finish": "Matte", "Writable": "Ball/gel/fountain" } },
    { id: "eraser-set",      name: "Doodle Eraser + Sharpener Set",         brand: "Doodle",     category: "school",    price: 89,  mrp: 140, rating: 4.3, ratingCount: 412,  emoji: "🧽", bg: "#F1F6EC", ink: "#6A994E", stock: 70, tags: [],
      highlights: ["Dust-free erasers ×4", "Single-hole sharpeners ×2", "Non-toxic, kid-safe", "Smudge-free erasing"],
      specs: { "Erasers": "4", "Sharpeners": "2", "Material": "Non-toxic", "Age": "3+" } },

    { id: "planner-2026",    name: "PaperMuse Daily Planner 2026",          brand: "PaperMuse",  category: "planners",  price: 449, mrp: 650, rating: 4.8, ratingCount: 1980, emoji: "🗓️", bg: "#EFF3FF", ink: "#4056C9", stock: 24, tags: ["bestseller", "new"],
      highlights: ["Dated Jan–Dec 2026", "Day page: priorities + habits", "Monthly spreads + goals", "A5 hardbound, lay-flat"],
      specs: { "Year": "2026 dated", "Size": "A5", "Binding": "Hardbound", "Extras": "Habit tracker, pocket" } },
    { id: "wall-calendar",   name: "Scriptora Monthly Wall Calendar",       brand: "Scriptora",  category: "planners",  price: 149, mrp: 240, rating: 4.2, ratingCount: 165,  emoji: "📅", bg: "#FDF6EC", ink: "#B4832A", stock: 55, tags: [],
      highlights: ["12 monthly sheets", "Big date boxes to write", "Matte art paper, no glare", "Steel hook hanger"],
      specs: { "Size": "17×24 in", "Sheets": "12", "Paper": "150 gsm art", "Hanging": "Center hook" } },

    /* ONE product, three size variants (3/4/5 mm). The _vc-* records below hold
       per-variant price/photo for cart & orders; they are hidden from all
       listings via the "vc-hidden" tag and exposed as PT.visibleProducts. */
    { id: "bamboo-chopsticks",name: "Bamboo Chopstick",                         brand: "UVID Essentials", category: "office", price: 46,  mrp: 46,  rating: null, ratingCount: 0,  emoji: "🥢", bg: "#F7F1E4", ink: "#B08A3E", stock: 100, tags: ["new"],
      highlights: ["Natural-finish bamboo, 20 cm long", "Choose 3 mm, 4 mm or 5 mm thickness", "Handy pack for meals at home or on the go", "Light single-use or reusable quality"],
      specs: { "Material": "Natural bamboo", "Length": "20 cm", "Finish": "Natural" },
      variantMeta: [
        { id: "_vc-bamboo-chopsticks-3", size: "3 mm", label: "3 mm × 20 cm", price: 46 },
        { id: "_vc-bamboo-chopsticks-4", size: "4 mm", label: "4 mm × 20 cm", price: 75 },
        { id: "_vc-bamboo-chopsticks-5", size: "5 mm", label: "5 mm × 20 cm", price: 100 }
      ] },

    { id: "_vc-bamboo-chopsticks-3", name: "Bamboo Chopstick — 3 mm × 20 cm", brand: "UVID Essentials", category: "office", price: 46,  mrp: 46,  rating: null, ratingCount: 0, emoji: "🥢", bg: "#F7F1E4", ink: "#B08A3E", stock: 100, tags: ["vc-hidden"], parent: "bamboo-chopsticks",
      highlights: ["Natural-finish bamboo, 20 cm long", "3 mm slim profile, easy to handle", "Handy pack for meals at home or on the go", "Light single-use or reusable quality"],
      specs: { "Material": "Natural bamboo", "Thickness": "3 mm", "Length": "20 cm", "Finish": "Natural" } },

    { id: "_vc-bamboo-chopsticks-4", name: "Bamboo Chopstick — 4 mm × 20 cm", brand: "UVID Essentials", category: "office", price: 75,  mrp: 75,  rating: null, ratingCount: 0, emoji: "🥢", bg: "#F7F1E4", ink: "#B08A3E", stock: 100, tags: ["vc-hidden"], parent: "bamboo-chopsticks",
      highlights: ["Natural-finish bamboo, 20 cm long", "4 mm sturdy profile, easy to handle", "Handy pack for meals at home or on the go", "Light single-use or reusable quality"],
      specs: { "Material": "Natural bamboo", "Thickness": "4 mm", "Length": "20 cm", "Finish": "Natural" } },

    { id: "_vc-bamboo-chopsticks-5", name: "Bamboo Chopstick — 5 mm × 20 cm", brand: "UVID Essentials", category: "office", price: 100, mrp: 100, rating: null, ratingCount: 0, emoji: "🥢", bg: "#F7F1E4", ink: "#B08A3E", stock: 100, tags: ["vc-hidden"], parent: "bamboo-chopsticks",
      highlights: ["Natural-finish bamboo, 20 cm long", "5 mm extra-sturdy profile", "Handy pack for meals at home or on the go", "Light single-use or reusable quality"],
      specs: { "Material": "Natural bamboo", "Thickness": "5 mm", "Length": "20 cm", "Finish": "Natural" } }
  ];

  /* Resin mould photos are static repository assets. The live catalog mirrors
     these records in the product database, while this keeps the storefront
     useful if its API is temporarily unavailable. */
  var RESIN_MOULD_VARIANTS = [
    { id: "resin-moulds-designs-flower-8-inch", label: "Flower Mould — 8 in", size: "Flower Mould — 8 in", image: "/assets/resin-moulds/flower-mould-8-inch.jpeg", specs: { "Design": "Flower", "Size": "8 in" } },
    { id: "resin-moulds-designs-flower-set-1-4-inch", label: "Flower Mould Set — 1–4 in", size: "Flower Mould Set — 1–4 in", image: "/assets/resin-moulds/flower-garland-1-4-inch.jpeg", specs: { "Design": "Flower mould set", "Sizes": "1 in, 2 in, 3 in and 4 in" } },
    { id: "resin-moulds-designs-tray-12x16-inch", label: "Rectangular Tray — 12 × 16 in", size: "Rectangular Tray — 12 × 16 in", image: "/assets/resin-moulds/rectangular-tray-12x16-inch.jpeg", specs: { "Design": "Rectangular tray", "Size": "12 × 16 in (as marked in photo)" } },
    { id: "resin-moulds-designs-car-dashboard-4-inch", label: "Car Dashboard Mould — 4 in", size: "Car Dashboard Mould — 4 in", image: "/assets/resin-moulds/car-dashboard-4-inch.jpeg", specs: { "Design": "Car dashboard mould", "Size": "4 in" } },
    { id: "resin-moulds-designs-four-slot-rectangle", label: "Four-Slot Rectangle Mould", size: "Four-Slot Rectangle Mould", image: "/assets/resin-moulds/four-slot-rectangle-mould.jpeg", specs: { "Design": "Four-slot rectangle" } },
    { id: "resin-moulds-designs-circular-ring", label: "Circular Ring Mould", size: "Circular Ring Mould", image: "/assets/resin-moulds/circular-ring-mould.jpeg", specs: { "Design": "Circular ring" } },
    { id: "resin-moulds-designs-heart-set", label: "Heart Mould Set", size: "Heart Mould Set", image: "/assets/resin-moulds/heart-mould-set.jpeg", specs: { "Design": "Heart mould set" } },
    { id: "resin-moulds-designs-bookmark-pair", label: "Decorative Bookmark Mould Pair", size: "Decorative Bookmark Mould Pair", image: "/assets/resin-moulds/decorative-bookmark-mould-pair.jpeg", specs: { "Design": "Decorative wing/bookmark pair" } }
  ];
  var resinMouldDescription = "Choose from eight resin mould designs for flowers, trays, car dashboard pieces, rings, hearts and decorative bookmarks. Select a design to view its photo and size. Each design is ₹200, with 30 pieces available.";
  P.push({
    id: "resin-moulds-designs", name: "Resin Moulds — Choose Your Design", brand: "UVID", category: "resin-moulds",
    price: 200, mrp: 200, rating: null, ratingCount: 0, emoji: "🌸", bg: "#FFF8F0", ink: "#85614A", stock: 240,
    tags: ["new"], highlights: ["Eight mould designs to choose from", "Each design costs ₹200", "30 pieces available per design"],
    specs: { "Category": "Resin Moulds", "Price": "₹200 per design", "Stock": "30 per design" },
    description: resinMouldDescription,
    variantMeta: RESIN_MOULD_VARIANTS.map(function (v) { return { id: v.id, size: v.size, label: v.label, price: 200, stock: 30 }; })
  });
  RESIN_MOULD_VARIANTS.forEach(function (v) {
    P.push({
      id: v.id, name: "Resin Moulds — Choose Your Design — " + v.label, brand: "UVID", category: "resin-moulds",
      price: 200, mrp: 200, rating: null, ratingCount: 0, emoji: "🌸", bg: "#FFF8F0", ink: "#85614A", stock: 30,
      tags: ["vc-hidden"], parent: "resin-moulds-designs", localImage: v.image,
      highlights: ["Resin mould for creative projects", v.label, "₹200 each · 30 in stock"], specs: v.specs, description: resinMouldDescription
    });
  });
  /* Candle mould photos are shipped as repository assets. Each collection is
     one editable catalog parent with five individually priced/stocked designs. */
  var candleMouldPrice = 380, candleMouldMrp = 420;
  var CANDLE_MOULD_COLLECTIONS = [
    {
      id: "candle-rose-moulds", name: "Rose Candle Mould Collection",
      image: "/assets/candle-moulds/rose-zw354.jpeg", emoji: "🌹", bg: "#FFF5F4", ink: "#A04F63",
      variants: [
        { id: "candle-rose-moulds-zw352", label: "ZW352 · Rose Bouquet", image: "/assets/candle-moulds/rose-bouquet-zw352.jpeg", specs: { "Design": "Rose bouquet", "Model": "ZW352", "Mould size": "81 × 79 mm" } },
        { id: "candle-rose-moulds-zw343", label: "ZW343 · Three-Rose Pillar", image: "/assets/candle-moulds/three-rose-pillar-zw343.jpeg", specs: { "Design": "Three-rose pillar", "Model": "ZW343", "Mould size": "65 × 107 mm" } },
        { id: "candle-rose-moulds-zw342", label: "ZW342 · Rose Bloom", image: "/assets/candle-moulds/rose-bloom-zw342.jpeg", specs: { "Design": "Sculpted rose bloom", "Model": "ZW342", "Mould size": "87 × 83 × 80 mm" } },
        { id: "candle-rose-moulds-zw345", label: "ZW345 · Twin Rose Pillar", image: "/assets/candle-moulds/twin-rose-pillar-zw345.jpeg", specs: { "Design": "Twin rose pillar", "Model": "ZW345", "Mould size": "65 × 71 × 102 mm" } },
        { id: "candle-rose-moulds-zw346", label: "ZW346 · Layered Rose Bloom", image: "/assets/candle-moulds/layered-rose-bloom-zw346.jpeg", specs: { "Design": "Layered rose bloom", "Model": "ZW346", "Mould size": "99 mm" } }
      ]
    },
    {
      id: "candle-flower-moulds", name: "Flower Candle Mould Collection",
      image: "/assets/candle-moulds/flower-cluster-zw382.jpeg", emoji: "🌼", bg: "#FFF9ED", ink: "#A87426",
      variants: [
        { id: "candle-flower-moulds-zw381", label: "ZW381 · Lavender Pillar", image: "/assets/candle-moulds/lavender-pillar-zw381.jpeg", specs: { "Design": "Lavender pillar", "Model": "ZW381", "Mould size": "79 × 88 mm" } },
        { id: "candle-flower-moulds-zw347", label: "ZW347 · Dahlia Bloom", image: "/assets/candle-moulds/dahlia-bloom-zw347.jpeg", specs: { "Design": "Dahlia bloom", "Model": "ZW347", "Mould size": "93 × 92 mm" } },
        { id: "candle-flower-moulds-zw299", label: "ZW299 · Sunflower", image: "/assets/candle-moulds/sunflower-zw299.jpeg", specs: { "Design": "Sunflower", "Model": "ZW299", "Mould size": "91 mm" } },
        { id: "candle-flower-moulds-zw217", label: "ZW217 · Daisy Stem", image: "/assets/candle-moulds/daisy-stem-zw217.jpeg", specs: { "Design": "Daisy on stem", "Model": "ZW217", "Mould size": "75 × 116 mm" } },
        { id: "candle-flower-moulds-zw216", label: "ZW216 · Tulip Stem", image: "/assets/candle-moulds/tulip-stem-zw216.jpeg", specs: { "Design": "Tulip on stem", "Model": "ZW216", "Mould size": "75 × 106 mm" } }
      ]
    },
    {
      id: "candle-lotus-floral-moulds", name: "Lotus & Floral Candle Mould Collection",
      image: "/assets/candle-moulds/lotus-bloom-zw295.jpeg", emoji: "🪷", bg: "#FFF5F8", ink: "#9D5572",
      variants: [
        { id: "candle-lotus-floral-moulds-zw315", label: "ZW315 · Lotus Bowl", image: "/assets/candle-moulds/lotus-bowl-zw315.jpeg", specs: { "Design": "Lotus bowl", "Model": "ZW315", "Mould size": "86 × 50 mm" } },
        { id: "candle-lotus-floral-moulds-zw312", label: "ZW312 · Lotus Bud", image: "/assets/candle-moulds/lotus-bud-zw312.jpeg", specs: { "Design": "Lotus bud", "Model": "ZW312", "Mould size": "73 × 73 mm" } },
        { id: "candle-lotus-floral-moulds-zw327", label: "ZW327 · Blossom", image: "/assets/candle-moulds/blossom-zw327.jpeg", specs: { "Design": "Blossom candle", "Model": "ZW327", "Mould size": "80 × 48 mm" } },
        { id: "candle-lotus-floral-moulds-zw301", label: "ZW301 · Red Flower", image: "/assets/candle-moulds/red-flower-zw301.jpeg", specs: { "Design": "Red flower", "Model": "ZW301", "Mould size": "93 mm" } },
        { id: "candle-lotus-floral-moulds-zw353", label: "ZW353 · Rose Pedestal", image: "/assets/candle-moulds/rose-pedestal-zw353.jpeg", specs: { "Design": "Rose pedestal", "Model": "ZW353", "Mould size": "84 × 74 mm" } }
      ]
    },
    {
      id: "candle-ornate-pillar-moulds", name: "Ornate Pillar Candle Mould Collection",
      image: "/assets/candle-moulds/ornate-pillar-zl198.jpeg", emoji: "🕯️", bg: "#FFF8F3", ink: "#80533F",
      variants: [
        { id: "candle-ornate-pillar-moulds-zl197", label: "ZL-197 · Scroll Pillar", image: "/assets/candle-moulds/ornate-pillar-zl197.jpeg", specs: { "Design": "Ornate scroll pillar", "Model": "ZL-197", "Mould dimensions": "58 × 123 mm", "Finished candle dimensions": "41 × 112 mm" } },
        { id: "candle-ornate-pillar-moulds-zl195", label: "ZL-195 · Sculpted Pillar", image: "/assets/candle-moulds/ornate-pillar-zl195.jpeg", specs: { "Design": "Sculpted pillar", "Model": "ZL-195", "Mould dimensions": "70 × 112 mm", "Finished candle dimensions": "59 × 101 mm" } },
        { id: "candle-ornate-pillar-moulds-zl194", label: "ZL-194 · Fluted Pillar", image: "/assets/candle-moulds/ornate-pillar-zl194.jpeg", specs: { "Design": "Fluted pillar", "Model": "ZL-194", "Mould dimensions": "61 × 111 mm", "Finished candle dimensions": "51 × 102 mm" } },
        { id: "candle-ornate-pillar-moulds-zl196", label: "ZL-196 · Ripple Pillar", image: "/assets/candle-moulds/ornate-pillar-zl196.jpeg", specs: { "Design": "Ripple pillar", "Model": "ZL-196", "Mould dimensions": "59 × 121 mm", "Finished candle dimensions": "45 × 111 mm" } }
      ]
    },
    {
      id: "candle-whimsical-moulds", name: "Whimsical Candle Mould Collection",
      image: "/assets/candle-moulds/honey-bear-pillar-zl943.jpeg", emoji: "🕯️", bg: "#FFF7E7", ink: "#8A5A22",
      localOnly: true,
      description: "Create playful, character-inspired candles with this whimsical collection. ZL-943 is the featured design; choose from six additional mould designs. Each selectable design is ₹380 (MRP ₹420), with 30 pieces available.",
      specs: { "Featured model": "ZL-943", "Featured candle height": "100 mm", "Price": "₹380 per selected design (MRP ₹420)", "Stock": "30 pieces per selected design" },
      variants: [
        { id: "candle-whimsical-moulds-zl900", label: "ZL900 · Portrait", image: "/assets/candle-moulds/portrait-candle-zl900.jpeg", specs: { "Model": "ZL900", "Mould dimensions": "113 × 85 mm (150 g)", "Finished candle": "101 × 75 mm (146 g)" } },
        { id: "candle-whimsical-moulds-zl895", label: "ZL895 · Owl", image: "/assets/candle-moulds/owl-candle-zl895.jpeg", specs: { "Model": "ZL895", "Mould dimensions": "83 × 83 mm (110 g)", "Finished candle": "74 × 71 mm (117 g)" } },
        { id: "candle-whimsical-moulds-zl888", label: "ZL888 · Witch and Owl", image: "/assets/candle-moulds/witch-owl-candle-zl888.jpeg", specs: { "Model": "ZL888", "Mould dimensions": "77 × 106 mm (161 g)", "Finished candle": "73 × 93 mm (255 g)" } },
        { id: "candle-whimsical-moulds-zl878", label: "ZL878 · Cherub", image: "/assets/candle-moulds/cherub-candle-zl878.jpeg", specs: { "Model": "ZL878", "Mould dimensions": "83 × 88 mm (141 g)", "Finished candle": "69 × 79 mm (151 g)" } },
        { id: "candle-whimsical-moulds-zl890", label: "ZL890 · Owl on Stump", image: "/assets/candle-moulds/owl-candle-zl890.jpeg", specs: { "Model": "ZL890", "Mould dimensions": "70 × 89 mm (96 g)", "Finished candle": "60 × 79 mm (96 g)" } },
        { id: "candle-whimsical-moulds-zl909", label: "ZL909 · Heart Babies", image: "/assets/candle-moulds/heart-babies-candle-zl909.jpeg", specs: { "Model": "ZL909", "Mould dimensions": "90 × 87 mm", "Finished candle": "80 × 75 mm" } }
      ]
    }
  ];
  CANDLE_MOULD_COLLECTIONS.forEach(function (group) {
    var description = group.description || ("Browse " + group.variants.length + " selectable decorative candle mould designs in the " + group.name.toLowerCase() + ". View the featured mould and finished candle, then choose an available design. Each design is ₹380 (MRP ₹420), with 30 pieces in stock per design.");
    P.push({
      id: group.id, name: group.name, brand: "UVID", category: "candle-making",
      price: candleMouldPrice, mrp: candleMouldMrp, rating: null, ratingCount: 0, emoji: group.emoji, bg: group.bg, ink: group.ink,
      stock: group.variants.length * 30, tags: ["new"], localImage: group.image, localOnly: group.localOnly === true,
      highlights: group.highlights || [(group.variants.length + 1) + " collection photos", "₹380 per selected design · MRP ₹420", "30 pieces in stock per design"],
      specs: Object.assign({ "Category": "Candle Making", "Price": "₹380 per design (MRP ₹420)", "Stock": "30 per design" }, group.specs || {}),
      description: description,
      variantMeta: group.variants.map(function (variant) { return { id: variant.id, size: variant.label, label: variant.label, price: candleMouldPrice, mrp: candleMouldMrp, stock: 30 }; })
    });
    group.variants.forEach(function (variant) {
      P.push({
        id: variant.id, name: group.name + " — " + variant.label, brand: "UVID", category: "candle-making",
        price: candleMouldPrice, mrp: candleMouldMrp, rating: null, ratingCount: 0, emoji: group.emoji, bg: group.bg, ink: group.ink, stock: 30,
        tags: ["vc-hidden"], parent: group.id, variantLabel: variant.label, localImage: variant.image, localOnly: group.localOnly === true,
        highlights: ["Decorative candle mould for handmade candle projects", variant.label, "₹380 each · MRP ₹420 · 30 in stock"],
        specs: variant.specs, description: description
      });
    });
  });
  var CANDLE_TWIST_VARIANTS = [
    { id: "candle-twist-moulds-zl52", label: "ZL-52 · Tall Wave", image: "/assets/candle-moulds/tall-wave-zl52.jpeg", specs: { "Design": "Tall sculpted wave", "Model": "ZL-52", "Mould size": "65 × 55 × 131 mm" } },
    { id: "candle-twist-moulds-zl50", label: "ZL-50 · Slim Twist", image: "/assets/candle-moulds/slim-twist-zl50.jpeg", specs: { "Design": "Slim twisted pillar", "Model": "ZL-50", "Mould size": "66 × 63 × 133 mm" } },
    { id: "candle-twist-moulds-zl51", label: "ZL-51 · Pastel Wave", image: "/assets/candle-moulds/pastel-wave-zl51.jpeg", specs: { "Design": "Pastel wavy pillar", "Model": "ZL-51", "Mould size": "65 × 132 mm" } },
    { id: "candle-twist-moulds-zl53", label: "ZL-53 · Ocean Wave", image: "/assets/candle-moulds/ocean-wave-zl53.jpeg", specs: { "Design": "Ocean wave pillar", "Model": "ZL-53", "Mould size": "59 × 133 mm" } },
    { id: "candle-twist-moulds-zl55", label: "ZL-55 · Deep Twist", image: "/assets/candle-moulds/deep-twist-zl55.jpeg", specs: { "Design": "Deep sculpted twist", "Model": "ZL-55", "Mould size": "75 × 76 × 130 mm" } },
    { id: "candle-twist-moulds-zl57b", label: "ZL-57B · Short Wave", image: "/assets/candle-moulds/short-wave-zl57b.jpeg", specs: { "Design": "Short wave pillar", "Model": "ZL57B", "Mould size": "7.5 × 7 cm" } }
  ];
  var candleTwistDescription = "Make sculptural candles with six selectable twisted and wave-pillar mould designs. Choose a model to view its mould and finished-candle photo. Each design is ₹380 (MRP ₹420), with 30 pieces in stock per design.";
  P.push({
    id: "candle-twist-moulds", name: "Twisted Pillar Candle Mould Collection", brand: "UVID", category: "candle-making",
    price: candleMouldPrice, mrp: candleMouldMrp, rating: null, ratingCount: 0, emoji: "🕯️", bg: "#FFF3F7", ink: "#A54B70",
    stock: CANDLE_TWIST_VARIANTS.length * 30, tags: ["new"], localImage: "/assets/candle-moulds/spiral-pillar-zl57a.jpeg",
    highlights: ["Six wave and twist designs", "₹380 per selected design · MRP ₹420", "30 pieces in stock per design"],
    specs: { "Category": "Candle Making", "Price": "₹380 per design (MRP ₹420)", "Stock": "30 per design" },
    description: candleTwistDescription,
    variantMeta: CANDLE_TWIST_VARIANTS.map(function (variant) { return { id: variant.id, size: variant.label, label: variant.label, price: candleMouldPrice, mrp: candleMouldMrp, stock: 30 }; })
  });
  CANDLE_TWIST_VARIANTS.forEach(function (variant) {
    P.push({
      id: variant.id, name: "Twisted Pillar Candle Mould Collection — " + variant.label,
      brand: "UVID", category: "candle-making", price: candleMouldPrice, mrp: candleMouldMrp, rating: null, ratingCount: 0,
      emoji: "🕯️", bg: "#FFF3F7", ink: "#A54B70", stock: 30, tags: ["vc-hidden"],
      parent: "candle-twist-moulds", variantLabel: variant.label, localImage: variant.image,
      highlights: ["Twisted pillar candle mould for handmade candles", variant.label, "₹380 each · MRP ₹420 · 30 in stock"],
      specs: variant.specs, description: candleTwistDescription
    });
  });
  var CANDLE_SCULPTED_VARIANTS = [
    { id: "candle-sculpted-pillar-zl513", label: "ZL-513 · Sculpted Shell", image: "/assets/candle-moulds/sculpted-pillar-zl513.jpeg", specs: { "Design": "Sculpted shell pillar", "Model": "ZL-513", "Mould size": "60 × 115 mm", "Finished candle": "50 × 107 mm" } },
    { id: "candle-sculpted-pillar-zl400", label: "ZL-400 · Tulip Garden", image: "/assets/candle-moulds/tulip-garden-pillar-zl400.jpeg", specs: { "Design": "Tulip garden pillar", "Model": "ZL-400", "Mould size": "83 × 80 × 109 mm", "Finished candle": "73 × 70 × 102 mm", "Capacity": "370 ml" } },
    { id: "candle-sculpted-pillar-zl397", label: "ZL-397 · Sunflower Relief", image: "/assets/candle-moulds/sunflower-pillar-zl397.jpeg", specs: { "Design": "Sunflower relief pillar", "Model": "ZL-397", "Mould size": "80 × 87 × 117 mm", "Finished candle": "75 × 80 × 106 mm", "Capacity": "400 ml" } },
    { id: "candle-sculpted-pillar-zl240", label: "ZL-240 · Ornate Scroll", image: "/assets/candle-moulds/scrollwork-pillar-zl240.jpeg", specs: { "Design": "Ornate scroll pillar", "Model": "ZL-240", "Mould size": "89 × 83 × 113 mm", "Finished candle": "79 × 71 × 101 mm", "Capacity": "295 ml" } },
    { id: "candle-sculpted-pillar-zl234", label: "ZL-234 · Flowing Wave", image: "/assets/candle-moulds/flowing-wave-pillar-zl234.jpeg", specs: { "Design": "Flowing wave pillar", "Model": "ZL-234", "Mould size": "75 × 80 × 132 mm", "Finished candle": "64 × 68 × 122 mm", "Capacity": "325 ml" } },
    { id: "candle-sculpted-pillar-zl237", label: "ZL-237 · Embossed Wave", image: "/assets/candle-moulds/embossed-wave-pillar-zl237.jpeg", specs: { "Design": "Embossed wave pillar", "Model": "ZL-237", "Mould size": "78 × 113 mm", "Finished candle": "69 × 100 mm" } },
    { id: "candle-sculpted-pillar-zl236", label: "ZL-236 · Green Scroll", image: "/assets/candle-moulds/green-scroll-pillar-zl236.jpeg", specs: { "Design": "Green scroll pillar", "Model": "ZL-236", "Mould size": "82 × 74 × 112 mm", "Finished candle": "71 × 65 × 101 mm", "Capacity": "295 ml" } },
    { id: "candle-sculpted-pillar-zl239", label: "ZL-239 · Floral Relief", image: "/assets/candle-moulds/floral-relief-pillar-zl239.jpeg", specs: { "Design": "Floral relief pillar", "Model": "ZL-239", "Mould size": "80 × 77 × 111 mm", "Finished candle": "68 × 67 × 100 mm", "Capacity": "315 ml" } },
    { id: "candle-sculpted-pillar-zl392", label: "ZL-392 · Autumn Leaves", image: "/assets/candle-moulds/autumn-leaf-pillar-zl392.jpeg", specs: { "Design": "Autumn leaf pillar", "Model": "ZL-392", "Mould size": "72 × 70 × 120 mm", "Finished candle": "62 × 60 × 107 mm", "Capacity": "255 ml" } },
    { id: "candle-sculpted-pillar-zl396", label: "ZL-396 · Lily Relief", image: "/assets/candle-moulds/lily-relief-pillar-zl396.jpeg", specs: { "Design": "Lily relief pillar", "Model": "ZL-396", "Mould size": "59 × 117 mm", "Finished candle": "52 × 110 mm" } },
    { id: "candle-sculpted-pillar-zl399", label: "ZL-399 · Lavender Sprig", image: "/assets/candle-moulds/lavender-sprig-pillar-zl399.jpeg", specs: { "Design": "Lavender sprig pillar", "Model": "ZL-399", "Mould size": "71 × 107 mm", "Finished candle": "61 × 99 mm" } }
  ];
  var candleSculptedDescription = "Choose from eleven decorative silicone mould designs for making sculpted pillar candles. Each model has its own design and dimensions shown in the photos. Select a model above; each mould is ₹380 (MRP ₹420), with 30 pieces available per model.";
  P.push({
    id: "candle-sculpted-pillar-moulds", name: "Sculpted Pillar Candle Mould Collection", brand: "UVID", category: "candle-making",
    price: candleMouldPrice, mrp: candleMouldMrp, rating: null, ratingCount: 0, emoji: "🕯️", bg: "#FFF8F3", ink: "#80533F", localOnly: true,
    stock: CANDLE_SCULPTED_VARIANTS.length * 30, tags: ["new"], localImage: CANDLE_SCULPTED_VARIANTS[0].image,
    highlights: ["11 sculpted pillar designs to choose from", "₹380 per selected model · MRP ₹420", "30 pieces in stock per model"],
    specs: { "Category": "Candle Making", "Models": "ZL-513, ZL-400, ZL-397, ZL-240, ZL-234, ZL-237, ZL-236, ZL-239, ZL-392, ZL-396 and ZL-399", "Price": "₹380 per model (MRP ₹420)", "Stock": "30 per model" },
    description: candleSculptedDescription,
    variantMeta: CANDLE_SCULPTED_VARIANTS.map(function (variant) { return { id: variant.id, size: variant.label, label: variant.label, price: candleMouldPrice, mrp: candleMouldMrp, stock: 30 }; })
  });
  CANDLE_SCULPTED_VARIANTS.forEach(function (variant) {
    P.push({
      id: variant.id, name: "Sculpted Pillar Candle Mould Collection — " + variant.label,
      brand: "UVID", category: "candle-making", price: candleMouldPrice, mrp: candleMouldMrp, rating: null, ratingCount: 0,
      emoji: "🕯️", bg: "#FFF8F3", ink: "#80533F", stock: 30, tags: ["vc-hidden"], localOnly: true,
      parent: "candle-sculpted-pillar-moulds", variantLabel: variant.label, localImage: variant.image,
      highlights: ["Silicone mould for decorative handmade pillar candles", variant.label, "₹380 each · MRP ₹420 · 30 in stock"],
      specs: variant.specs, description: candleSculptedDescription
    });
  });

  /* Four smaller candle-making listings group the 22 UVID silicone mould designs. */
  var UVID_SILICONE_MOULD_VARIANTS = [
    { id: "uvidsm-123", code: "UVIDSM123", name: "Classic Geometric Earrings Mold", sku: "DI-RM-415", mrp: 220 },
    { id: "uvidsm-124", code: "UVIDSM124", name: "Flower Earrings Mold", sku: "DI-RM-416", mrp: 220 },
    { id: "uvidsm-125", code: "UVIDSM125", name: "Cartoon Animal Earrings Mold", sku: "DI-RM-417", mrp: 220 },
    { id: "uvidsm-126", code: "UVIDSM126", name: "Soft Petal Flower Candle Mold", sku: "DI-RM-430", mrp: 220 },
    { id: "uvidsm-127", code: "UVIDSM127", name: "Soft Blossom Flower Candle Mold", sku: "DI-RM-431", mrp: 220 },
    { id: "uvidsm-128", code: "UVIDSM128", name: "Line Petal Flower Candle Mold", sku: "DI-RM-432", mrp: 220 },
    { id: "uvidsm-129", code: "UVIDSM129", name: "Sunflower Flower Candle Mold", sku: "DI-RM-433", mrp: 220 },
    { id: "uvidsm-130", code: "UVIDSM130", name: "Floop Flower Candle Mold", sku: "DI-RM-426", mrp: 220 },
    { id: "uvidsm-131", code: "UVIDSM131", name: "Petix Flower Candle Mold", sku: "DI-RM-427", mrp: 220 },
    { id: "uvidsm-132", code: "UVIDSM132", name: "Tulira Bloom Flower Candle Mold", sku: "DI-RM-428", mrp: 220 },
    { id: "uvidsm-133", code: "UVIDSM133", name: "Tulon Flower Candle Mold", sku: "DI-RM-429", mrp: 220 },
    { id: "uvidsm-134", code: "UVIDSM134", name: "Loopa Flower Candle Mold", sku: "DI-RM-420", mrp: 220 },
    { id: "uvidsm-135", code: "UVIDSM135", name: "Bublo Flower Candle Mold", sku: "DI-RM-421", mrp: 220 },
    { id: "uvidsm-136", code: "UVIDSM136", name: "Petlo Flower Candle Mold", sku: "DI-RM-422", mrp: 220 },
    { id: "uvidsm-137", code: "UVIDSM137", name: "Classic Deep Daisy Flower Candle Mold", sku: "DI-RM-423", mrp: 220 },
    { id: "uvidsm-138", code: "UVIDSM138", name: "Bloomy Flower Candle Mold", sku: "DI-RM-424", mrp: 220 },
    { id: "uvidsm-139", code: "UVIDSM139", name: "Flory Flower Candle Mold", sku: "DI-RM-425", mrp: 220 },
    { id: "uvidsm-140", code: "UVIDSM140", name: "Flora Flower Candle Mold", sku: "DI-RM-418", mrp: 220 },
    { id: "uvidsm-141", code: "UVIDSM141", name: "Swirta Flower Candle Mold", sku: "DI-RM-419", mrp: 220 },
    { id: "uvidsm-147", code: "UVIDSM147", name: "Lace-edged Candle holder", sku: "DI-RM-0397", mrp: 660 },
    { id: "uvidsm-148", code: "UVIDSM148", name: "Arabic Prayer Mold", sku: "DI-RM-0399", mrp: 560 },
    { id: "uvidsm-149", code: "UVIDSM149", name: "Cross Mold", sku: "DI-RM-0398", mrp: 460 }
  ];
  var UVID_SILICONE_MOULD_GROUPS = [
    { id: "uvidsm-earring-moulds", name: "Silicone Earring Moulds — Choose a Design", variantIds: ["uvidsm-123", "uvidsm-124", "uvidsm-125"] },
    { id: "uvidsm-flower-moulds-set-1", name: "Flower Candle Moulds — Set 1", variantIds: ["uvidsm-126", "uvidsm-127", "uvidsm-128", "uvidsm-129", "uvidsm-130", "uvidsm-131", "uvidsm-132", "uvidsm-133"] },
    { id: "uvidsm-flower-moulds-set-2", name: "Flower Candle Moulds — Set 2", variantIds: ["uvidsm-134", "uvidsm-135", "uvidsm-136", "uvidsm-137", "uvidsm-138", "uvidsm-139", "uvidsm-140", "uvidsm-141"] },
    { id: "uvidsm-decorative-moulds", name: "Decorative Candle Moulds — Choose a Design", variantIds: ["uvidsm-147", "uvidsm-148", "uvidsm-149"] }
  ];
  var uvidSiliconeMouldById = Object.create(null);
  UVID_SILICONE_MOULD_VARIANTS.forEach(function (m) { uvidSiliconeMouldById[m.id] = m; });
  UVID_SILICONE_MOULD_GROUPS.forEach(function (group) {
    var options = group.variantIds.map(function (id) { return uvidSiliconeMouldById[id]; });
    var first = options[0];
    var price = Math.round(first.mrp * 0.7);
    var description = "Choose from " + options.length + " silicone mould designs. Each design has its own photo, UVID item code and catalogue SKU. Every design is priced at 30% off its catalogue MRP.";
    P.push({
      id: group.id, name: group.name, brand: "UVID Art and Craft Supplies", category: "candle-making",
      price: price, mrp: first.mrp, rating: null, ratingCount: 0,
      emoji: "🕯️", bg: "#F7F1E8", ink: "#A66B3F", stock: options.length * 25, tags: ["new", "deal"],
      localImage: "/assets/" + first.id + ".jpg",
      highlights: ["Choose from " + options.length + " catalogue designs", "Every design has its own photo, item code and SKU", "30% off each design's catalogue MRP"],
      specs: { "Category": "Candle Making", "Available designs": String(options.length), "Discount": "30% off each catalogue MRP" },
      description: description,
      variantMeta: options.map(function (m) {
        return { id: m.id, size: m.code, label: m.code + " · " + m.name, name: m.name, price: Math.round(m.mrp * 0.7), mrp: m.mrp, stock: 25 };
      })
    });
    options.forEach(function (m) {
      var variantPrice = Math.round(m.mrp * 0.7);
      P.push({
        id: m.id, name: m.name, brand: "UVID Art and Craft Supplies", category: "candle-making",
        price: variantPrice, mrp: m.mrp, rating: null, ratingCount: 0, emoji: "🕯️", bg: "#F7F1E8", ink: "#A66B3F",
        stock: 25, tags: ["vc-hidden", "deal"], parent: group.id, variantLabel: m.code + " · " + m.name,
        localImage: "/assets/" + m.id + ".jpg",
        highlights: ["Silicone mould for candle making and creative projects", "Item code: " + m.code, "Catalogue SKU: " + m.sku],
        specs: { "Item Code": m.code, "Catalogue SKU": m.sku, "MRP": "₹" + m.mrp, "Discount": "30%", "Price": "₹" + variantPrice },
        description: description
      });
    });
  });
  var roundResinDescription = "Round resin mould for trays and creative resin projects. Available sizes: 3 inch, 4 inch, 6 inch, 8 inch and 18 inches. Choose your size above. Each size is ₹200, with 30 pieces available.";
  var ROUND_MOULD_VARIANTS = [
    { id: "round-resin-mould-3-inch", label: "3 inch", image: "/assets/resin-moulds/round-resin-mould.jpg" },
    { id: "round-resin-mould-4-inch", label: "4 inch", image: "/assets/resin-moulds/round-resin-mould.jpg" },
    { id: "round-resin-mould-6-inch", label: "6 inch", image: "/assets/resin-moulds/round-resin-mould.jpg" },
    { id: "round-resin-mould-8-inch", label: "8 inch", image: "/assets/resin-moulds/round-resin-mould.jpg" },
    { id: "round-resin-mould-18-inch", label: "18 inches", image: "/assets/resin-moulds/round-resin-mould.jpg" }
  ];
  P.push({
    id: "round-resin-mould", name: "Round Resin Mould", brand: "UVID", category: "resin-moulds",
    price: 200, mrp: 200, rating: null, ratingCount: 0, emoji: "⚪", bg: "#FFF8F0", ink: "#85614A", stock: 150,
    tags: ["new"], highlights: ["Round mould for resin projects", "Available sizes: 3, 4, 6, 8 and 18 inches", "₹200 each · 30 in stock per size"],
    specs: { "Design": "Round resin mould", "Available sizes": "3, 4, 6, 8 and 18 inches", "Stock": "30 per size" },
    description: roundResinDescription,
    variantMeta: ROUND_MOULD_VARIANTS.map(function (v) { return { id: v.id, size: v.label, label: v.label, price: 200, stock: 30 }; })
  });
  ROUND_MOULD_VARIANTS.forEach(function (v) {
    P.push({
      id: v.id, name: "Round Resin Mould — " + v.label, brand: "UVID", category: "resin-moulds",
      price: 200, mrp: 200, rating: null, ratingCount: 0, emoji: "⚪", bg: "#FFF8F0", ink: "#85614A", stock: 30,
      tags: ["vc-hidden"], parent: "round-resin-mould", localImage: v.image,
      highlights: ["Round mould for resin projects", "Size: " + v.label, "₹200 each · 30 in stock"],
      specs: { "Design": "Round resin mould", "Size": v.label }, description: roundResinDescription
    });
  });

  /* attach generated art + derived fields.
     Real photos: window.UVID_IMG (from data/product-images.js) overrides SVG art
     when assets/<product-id>.jpg exists — built by tools/embed-images.js. */
  var REAL = (typeof window !== "undefined" && window.UVID_IMG) || {};
  P.forEach(function (p, i) {
    p.img = p.localImage || REAL[p.id] || art(p.emoji, p.bg, p.ink);
    p.thumb = p.img;
    p.discount = Math.round(((p.mrp - p.price) / p.mrp) * 100);
    p.added = P.length - i;              // "newest" ordering
    p.popularity = p.ratingCount + p.discount * 7; // demo relevance score
  });

  /* wire the chopstick size variants: attach per-variant price/label/photo to
     the main product; main image defaults to the first variant (3 mm). */
  (function () {
    var main = null, i, j;
    for (i = 0; i < P.length; i++) if (P[i].id === "bamboo-chopsticks") main = P[i];
    if (!main || !main.variantMeta) return;
    main.variants = [];
    for (i = 0; i < main.variantMeta.length; i++) {
      var vm = main.variantMeta[i], rec = null;
      for (j = 0; j < P.length; j++) if (P[j].id === vm.id) rec = P[j];
      if (!rec) continue;
      rec.parent = main.id;
      main.variants.push({ id: rec.id, size: vm.size, label: vm.label, price: rec.price, mrp: rec.mrp, img: rec.img });
    }
    if (main.variants.length) main.img = main.variants[0].img; // 3 mm pack shot
  })();

  /* Wire the eight resin mould designs to the product page selector. */
  (function () {
    var main = null, i, j;
    for (i = 0; i < P.length; i++) if (P[i].id === "resin-moulds-designs") main = P[i];
    if (!main || !main.variantMeta) return;
    main.variants = [];
    for (i = 0; i < main.variantMeta.length; i++) {
      var vm = main.variantMeta[i], rec = null;
      for (j = 0; j < P.length; j++) if (P[j].id === vm.id) rec = P[j];
      if (!rec) continue;
      rec.parent = main.id;
      main.variants.push({ id: rec.id, size: vm.size, label: vm.label, price: rec.price, mrp: rec.mrp, stock: rec.stock, img: rec.img });
    }
    if (main.variants.length) {
      main.img = main.variants[0].img;
      main.stock = main.variants.reduce(function (total, variant) { return total + variant.stock; }, 0);
    }
  })();

  /* Wire the round mould size options to the product page selector. */
  (function () {
    var main = null, i, j;
    for (i = 0; i < P.length; i++) if (P[i].id === "round-resin-mould") main = P[i];
    if (!main || !main.variantMeta) return;
    main.variants = [];
    for (i = 0; i < main.variantMeta.length; i++) {
      var vm = main.variantMeta[i], rec = null;
      for (j = 0; j < P.length; j++) if (P[j].id === vm.id) rec = P[j];
      if (!rec) continue;
      rec.parent = main.id;
      main.variants.push({ id: rec.id, size: vm.size, label: vm.label, price: rec.price, mrp: rec.mrp, stock: rec.stock, img: rec.img });
    }
    if (main.variants.length) {
      main.img = main.variants[0].img;
      main.stock = main.variants.reduce(function (total, variant) { return total + variant.stock; }, 0);
    }
  })();

  /* Wire each candle mould collection's five photos to its design selector. */
  CANDLE_MOULD_COLLECTIONS.forEach(function (group) {
    var main = null, i, j;
    for (i = 0; i < P.length; i++) if (P[i].id === group.id) main = P[i];
    if (!main || !main.variantMeta) return;
    main.variants = [];
    for (i = 0; i < main.variantMeta.length; i++) {
      var vm = main.variantMeta[i], rec = null;
      for (j = 0; j < P.length; j++) if (P[j].id === vm.id) rec = P[j];
      if (!rec) continue;
      rec.parent = main.id;
      main.variants.push({ id: rec.id, size: vm.size, label: vm.label, price: rec.price, mrp: rec.mrp, stock: rec.stock, img: rec.img });
    }
  });

  /* Wire the twist-pillar designs to the Candle Making selector. */
  (function () {
    var main = null, i, j;
    for (i = 0; i < P.length; i++) if (P[i].id === "candle-twist-moulds") main = P[i];
    if (!main || !main.variantMeta) return;
    main.variants = [];
    for (i = 0; i < main.variantMeta.length; i++) {
      var vm = main.variantMeta[i], rec = null;
      for (j = 0; j < P.length; j++) if (P[j].id === vm.id) rec = P[j];
      if (!rec) continue;
      rec.parent = main.id;
      main.variants.push({ id: rec.id, size: vm.size, label: vm.label, price: rec.price, mrp: rec.mrp, stock: rec.stock, img: rec.img });
    }
  })();

  /* Wire the eleven sculpted pillar models to their selectable designs. */
  (function () {
    var main = null, i, j;
    for (i = 0; i < P.length; i++) if (P[i].id === "candle-sculpted-pillar-moulds") main = P[i];
    if (!main || !main.variantMeta) return;
    main.variants = [];
    for (i = 0; i < main.variantMeta.length; i++) {
      var vm = main.variantMeta[i], rec = null;
      for (j = 0; j < P.length; j++) if (P[j].id === vm.id) rec = P[j];
      if (!rec) continue;
      rec.parent = main.id;
      main.variants.push({ id: rec.id, size: vm.size, label: vm.label, price: rec.price, mrp: rec.mrp, stock: rec.stock, img: rec.img });
    }
    if (main.variants.length) {
      main.img = main.variants[0].img;
      main.stock = main.variants.reduce(function (total, variant) { return total + variant.stock; }, 0);
    }
  })();

  /* Wire each smaller silicone mould selector to its own photos and prices. */
  UVID_SILICONE_MOULD_GROUPS.forEach(function (group) {
    var main = null, i, j;
    for (i = 0; i < P.length; i++) if (P[i].id === group.id) main = P[i];
    if (!main || !main.variantMeta) return;
    main.variants = [];
    for (i = 0; i < main.variantMeta.length; i++) {
      var vm = main.variantMeta[i], rec = null;
      for (j = 0; j < P.length; j++) if (P[j].id === vm.id) rec = P[j];
      if (!rec) continue;
      rec.parent = main.id;
      main.variants.push({ id: rec.id, size: vm.size, label: vm.label, name: vm.name, price: rec.price, mrp: rec.mrp, stock: rec.stock, img: rec.img });
    }
    if (main.variants.length) {
      main.img = main.variants[0].img;
      main.stock = main.variants.reduce(function (total, variant) { return total + variant.stock; }, 0);
    }
  });
  /* products shown in listings/search/home — excludes _vc-* variant records */
  var VISIBLE = P.filter(function (p) { return p.tags.indexOf("vc-hidden") === -1; });

  /* ---------- coupons ---------- */
  var COUPONS = [
    { code: "PAPER10",  label: "10% off (up to ₹150)",       type: "percent", value: 10, cap: 150, min: 499,  note: "On orders above ₹499" },
    { code: "FIRST50",  label: "Flat ₹50 off",               type: "flat",    value: 50, cap: 50,  min: 399,  note: "On orders above ₹399" },
    { code: "DESK200",  label: "Flat ₹200 off",              type: "flat",    value: 200, cap: 200, min: 1999, note: "On orders above ₹1999" },
    { code: "FREESHIP", label: "Free delivery",              type: "ship",    value: 0,  cap: 0,   min: 0,    note: "No minimum — shipping on us" }
  ];

  /* ---------- deterministic review pool ---------- */
  var NAMES = ["Aarav S.", "Diya K.", "Rohan M.", "Ishita P.", "Kabir N.", "Meera T.", "Aditya R.", "Sara J.", "Vivaan B.", "Ananya D."];
  var HEADS = ["Excellent quality!", "Worth every rupee", "Exactly as described", "Great for daily use", "Packaging was perfect", "Good, minor niggles", "My new favourite", "Solid value buy"];
  var BODIES = [
    "Arrived two days early and the packaging was spotless. Paper quality is genuinely premium.",
    "Been using it daily for three weeks — zero complaints. Feels built to last.",
    "Colours/pieces matched the photos exactly. Would order again for my desk setup.",
    "Slight delay in delivery but the product itself is flawless. Seller communicated well.",
    "Gifted it to my sister and she loved it. Presentation box is a nice touch.",
    "Good for the price. Not luxury-grade, but absolutely reliable for students.",
    "The finish is much nicer in person. Photos don't do it justice.",
    "Does the job perfectly. Instant checkout and smooth delivery made it painless."
  ];

  function hash(s) {
    var h = 0, i;
    for (i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
    return h;
  }

  function reviewsFor(productId) {
    var h = hash(productId), out = [], n = 3 + (h % 3), i;
    for (i = 0; i < n; i++) {
      var r = hash(productId + ":" + i);
      var stars = [5, 5, 4, 4, 3][(r + i) % 5];
      out.push({
        name: NAMES[(r + i) % NAMES.length],
        stars: stars,
        head: HEADS[r % HEADS.length],
        body: BODIES[(r >> 3) % BODIES.length],
        date: ["Sep 2026", "Aug 2026", "Jul 2026", "Jun 2026"][(r + i) % 4],
        verified: (r % 4) !== 0
      });
    }
    return out;
  }

  /* ---------- exports ---------- */
  window.PT = {
    art: art, /* emoji-fallback product art (used by js/sync.js when the API has no image) */
    CATEGORIES: CATEGORIES,
    PRODUCTS: P,
    visibleProducts: VISIBLE,
    legacyCategoryRedirect: {
      "uvid-silicone-moulds": "candle-making"
    },
    legacyProductRedirect: {
      "bamboo-chopsticks-4mm": "bamboo-chopsticks",
      "bamboo-chopsticks-5mm": "bamboo-chopsticks"
    },
    COUPONS: COUPONS,
    reviewsFor: reviewsFor,
    findProduct: function (id) {
      /* legacy ids from the old separate listings map to their variant record */
      if (id === "bamboo-chopsticks-4mm") id = "_vc-bamboo-chopsticks-4";
      if (id === "bamboo-chopsticks-5mm") id = "_vc-bamboo-chopsticks-5";
      for (var i = 0; i < P.length; i++) if (P[i].id === id) return P[i];
      return null;
    },
    categoryBySlug: function (slug) {
      for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].slug === slug) return CATEGORIES[i];
      return null;
    }
  };
})();
