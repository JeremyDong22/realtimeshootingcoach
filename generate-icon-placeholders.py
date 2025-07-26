#!/usr/bin/env python3
# Generate placeholder icons for PWA
# Updated: 2025-07-26 - Create placeholder icons with basketball theme

from PIL import Image, ImageDraw, ImageFont
import os

def create_placeholder_icon(size, filename, bg_color='#FF6B35', text_color='white'):
    """Create a placeholder icon with basketball and size text"""
    # Create new image with background color
    img = Image.new('RGB', (size, size), bg_color)
    draw = ImageDraw.Draw(img)
    
    # Draw basketball lines
    center = size // 2
    radius = int(size * 0.35)
    line_width = max(2, size // 50)
    
    # Outer circle
    draw.ellipse(
        [(center - radius, center - radius), (center + radius, center + radius)],
        outline=text_color,
        width=line_width
    )
    
    # Vertical line
    draw.line([(center, center - radius), (center, center + radius)], 
              fill=text_color, width=line_width)
    
    # Horizontal line
    draw.line([(center - radius, center), (center + radius, center)], 
              fill=text_color, width=line_width)
    
    # Curved lines (simplified)
    # Left curve
    draw.arc([(center - radius * 0.7, center - radius), 
              (center + radius * 0.3, center + radius)],
             start=30, end=150, fill=text_color, width=line_width)
    
    # Right curve
    draw.arc([(center - radius * 0.3, center - radius), 
              (center + radius * 0.7, center + radius)],
             start=30, end=150, fill=text_color, width=line_width)
    
    # Add size text at bottom
    text = f"{size}x{size}"
    try:
        # Try to use a better font if available
        font_size = max(12, size // 10)
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
    except:
        # Fallback to default font
        font = ImageFont.load_default()
    
    # Get text bbox for centering
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    # Position text at bottom center
    text_x = (size - text_width) // 2
    text_y = size - text_height - (size // 20)
    
    # Draw text with shadow for better visibility
    shadow_offset = max(1, size // 100)
    draw.text((text_x + shadow_offset, text_y + shadow_offset), text, 
              fill='#00000080', font=font)
    draw.text((text_x, text_y), text, fill=text_color, font=font)
    
    # Save the image
    img.save(filename, 'PNG')
    print(f"Created: {filename}")

def main():
    """Generate all required icon sizes"""
    icons_dir = "/Users/jeremydong/Desktop/Build an APP/shootingcoach/icons"
    root_dir = "/Users/jeremydong/Desktop/Build an APP/shootingcoach"
    
    # Ensure icons directory exists
    os.makedirs(icons_dir, exist_ok=True)
    
    # Icon configurations (size, filename, location)
    icons = [
        # PWA manifest icons
        (192, 'icon-192.png', root_dir),
        (512, 'icon-512.png', root_dir),
        
        # Apple touch icon
        (180, 'apple-touch-icon.png', root_dir),
        
        # Additional sizes for manifest (optional but recommended)
        (72, 'icon-72.png', icons_dir),
        (96, 'icon-96.png', icons_dir),
        (128, 'icon-128.png', icons_dir),
        (144, 'icon-144.png', icons_dir),
        (152, 'icon-152.png', icons_dir),
        (384, 'icon-384.png', icons_dir),
        
        # Maskable icons (with safe area)
        (192, 'icon-192-maskable.png', icons_dir),
        (512, 'icon-512-maskable.png', icons_dir),
    ]
    
    # Generate each icon
    for size, filename, directory in icons:
        filepath = os.path.join(directory, filename)
        # Use different color for maskable icons
        if 'maskable' in filename:
            create_placeholder_icon(size, filepath, bg_color='#0A0A0A', text_color='#FF6B35')
        else:
            create_placeholder_icon(size, filepath)
    
    print(f"\nAll placeholder icons created!")
    print(f"Main icons in: {root_dir}")
    print(f"Additional icons in: {icons_dir}")
    print("\nTo create professional icons:")
    print("1. Use an AI image generator like DALL-E, Midjourney, or Stable Diffusion")
    print("2. Prompt: 'Minimalist basketball icon, flat design, orange and black colors, app icon style'")
    print("3. Or use online tools like:")
    print("   - https://www.canva.com (free templates)")
    print("   - https://www.figma.com (design tool)")
    print("   - https://icons8.com/icons (icon library)")
    print("   - https://www.flaticon.com (icon library)")

if __name__ == "__main__":
    main()