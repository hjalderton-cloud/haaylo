# Make Haaylo carousels reliably on-brand

The current carousel is not reliably on-brand. The saved Haaylo Brand DNA contains a full colour system, typography guidance, the new logo and a brand-guidelines image, but the carousel generator currently uses only two extracted colour codes and the tone of voice. It generates every slide as a separate AI image, so type, spacing and composition can drift between pages.

## The fixed Haaylo carousel system

Use one recognisable house style for every Haaylo carousel:

- Navy `#171D41`, pink `#FF5C93`, purple `#9B5CFF` and white as the core palette.
- Poppins with a bold geometric heading hierarchy and clean, readable body copy.
- The saved Haaylo logo in a consistent safe area.
- Flat, high-contrast compositions with generous margins and no gradients.
- Three controlled layouts: opening hook, content slide and closing call to action.
- Consistent page numbering, spacing, type scale and accent shapes across the full set.
- Dynamic text fitting so wording stays inside the canvas without becoming cramped or cut off.

## Build the slides accurately

Stop asking the image model to draw the complete slide and its lettering. Instead, build each carousel from editable design layers so:

- The supplied heading and body are rendered exactly as written.
- Every slide uses the same layout grid and brand rules.
- The logo, colours and font come from the selected workspace's saved Brand DNA and Brand Assets.
- A failed logo load falls back to a clean `haaylo.com` wordmark rather than breaking the set.
- Carousel creation remains capped at ten pages and retains the current opening/content/closing roles.

This applies to carousel graphics only. Ordinary generated photographs and illustrations remain unchanged.

## Make Studio editing real

The current Studio opens the generated slide as one flattened background. Change carousel editing so each slide opens with separate editable layers for:

- heading
- body copy
- logo or wordmark
- page number
- background and accent shapes

Saving from Studio replaces that slide's image and its editable design specification. Slide 1 continues to be the post image, and removing or regenerating slides continues to work as it does now.

## Brand-data handling

- Require the explicitly selected, owned workspace for carousel generation; remove the default-workspace fallback from this path.
- Resolve named colour ranges correctly rather than treating the first two hex codes as the whole palette.
- Read the latest saved logo and brand-guidelines asset for the selected workspace.
- Store the design specification alongside the existing carousel data in the post's `meta` field; no schema change.
- Keep existing routes, Content Bank behaviour, post fields and publishing integrations unchanged.

## Replace and verify the Haaylo carousel

Rebuild the existing eight-page **Introducing Haaylo** carousel with the fixed system after all eight pages render successfully. Do not leave a partially replaced set.

Checks:

- Compare every page against the saved Haaylo logo and brand-guidelines image.
- Confirm exact wording, consistent Poppins hierarchy, palette, logo placement and page numbering.
- Confirm long copy fits at phone and desktop sizes without clipping.
- Open at least one page in Studio, edit its text and colour, save it, and confirm the change survives refresh.
- Confirm slide 1 remains the main post image and the full set persists in the Content Bank.
- Confirm another workspace receives its own Brand DNA rather than Haaylo's fixed colours.
- Run the carousel and image tests plus the full typecheck.

Publishing remains separate and will only happen when requested.
