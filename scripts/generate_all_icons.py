import os
import shutil
import subprocess
from PIL import Image, ImageDraw

SOURCE_IMAGE = "/Users/mopiuy/.gemini/antigravity/brain/8d733de3-6365-41a9-8fa8-f0d9e4e64a15/.user_uploaded/media_1788792535182.png"
ROOT_DIR = "/Users/mopiuy/Projets/KDS"

def make_round(img):
    mask = Image.new('L', img.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, img.size[0] - 1, img.size[1] - 1), fill=255)
    res = img.copy()
    res.putalpha(mask)
    return res

def create_foreground(src, target_size):
    # Foreground canvas is target_size x target_size
    # Safe zone is central 66.6% (e.g. 72dp out of 108dp)
    safe_size = int(round(target_size * 0.72))
    resized_icon = src.resize((safe_size, safe_size), Image.Resampling.LANCZOS)
    
    fg = Image.new('RGBA', (target_size, target_size), (0, 0, 0, 0))
    offset = ((target_size - safe_size) // 2, (target_size - safe_size) // 2)
    fg.paste(resized_icon, offset, resized_icon)
    return fg

def main():
    print("Loading source image:", SOURCE_IMAGE)
    src = Image.open(SOURCE_IMAGE).convert('RGBA')
    w, h = src.size
    print(f"Source image dimensions: {w}x{h}")
    
    # 1. PUBLIC (Web / Chrome / PWA)
    pub_dir = os.path.join(ROOT_DIR, "public")
    os.makedirs(pub_dir, exist_ok=True)
    
    print("--> Generating Web / Chrome / PWA icons in public/...")
    # Multi-resolution favicon.ico
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    src.save(os.path.join(pub_dir, "favicon.ico"), format='ICO', sizes=ico_sizes)
    
    # PNG icons
    src.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(pub_dir, "iconmob.png"), "PNG")
    src.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(pub_dir, "icon-512.png"), "PNG")
    src.resize((192, 192), Image.Resampling.LANCZOS).save(os.path.join(pub_dir, "icon-192.png"), "PNG")
    src.resize((180, 180), Image.Resampling.LANCZOS).save(os.path.join(pub_dir, "apple-touch-icon.png"), "PNG")
    src.resize((32, 32), Image.Resampling.LANCZOS).save(os.path.join(pub_dir, "favicon-32x32.png"), "PNG")
    src.resize((16, 16), Image.Resampling.LANCZOS).save(os.path.join(pub_dir, "favicon-16x16.png"), "PNG")
    
    # 2. ELECTRON BUILD RESOURCES (Windows / Mac / Linux)
    build_dir = os.path.join(ROOT_DIR, "build")
    os.makedirs(build_dir, exist_ok=True)
    
    print("--> Generating Electron build icons in build/...")
    # icon.png (1024x1024)
    src.resize((1024, 1024), Image.Resampling.LANCZOS).save(os.path.join(build_dir, "icon.png"), "PNG")
    
    # icon.ico for Windows
    src.save(os.path.join(build_dir, "icon.ico"), format='ICO', sizes=ico_sizes)
    
    # icon.icns for macOS via iconutil
    iconset_dir = os.path.join(build_dir, "icon.iconset")
    os.makedirs(iconset_dir, exist_ok=True)
    mac_sizes = [
        (16, 'icon_16x16.png'),
        (32, 'icon_16x16@2x.png'),
        (32, 'icon_32x32.png'),
        (64, 'icon_32x32@2x.png'),
        (128, 'icon_128x128.png'),
        (256, 'icon_128x128@2x.png'),
        (256, 'icon_256x256.png'),
        (512, 'icon_256x256@2x.png'),
        (512, 'icon_512x512.png'),
        (1024, 'icon_512x512@2x.png'),
    ]
    for sz, name in mac_sizes:
        src.resize((sz, sz), Image.Resampling.LANCZOS).save(os.path.join(iconset_dir, name), 'PNG')
    
    icns_path = os.path.join(build_dir, "icon.icns")
    res = subprocess.run(['iconutil', '-c', 'icns', iconset_dir, '-o', icns_path], capture_output=True, text=True)
    shutil.rmtree(iconset_dir)
    if res.returncode == 0:
        print("  icon.icns successfully created!")
    else:
        print("  iconutil error:", res.stderr)
        
    # 3. ANDROID (Capacitor)
    android_res = os.path.join(ROOT_DIR, "android/app/src/main/res")
    if os.path.exists(android_res):
        print("--> Generating Android icons...")
        # Playstore icon
        playstore_path = os.path.join(ROOT_DIR, "android/app/src/main/ic_launcher-playstore.png")
        src.resize((512, 512), Image.Resampling.LANCZOS).save(playstore_path, "PNG")
        
        densities = {
            'mdpi': (48, 108),
            'hdpi': (72, 162),
            'xhdpi': (96, 216),
            'xxhdpi': (144, 324),
            'xxxhdpi': (192, 432),
        }
        for density, (app_size, fg_size) in densities.items():
            target_dir = os.path.join(android_res, f"mipmap-{density}")
            if os.path.exists(target_dir):
                # Standard square launcher
                app_icon = src.resize((app_size, app_size), Image.Resampling.LANCZOS)
                app_icon.save(os.path.join(target_dir, "ic_launcher.webp"), "WEBP", quality=95)
                
                # Round launcher
                round_icon = make_round(app_icon)
                round_icon.save(os.path.join(target_dir, "ic_launcher_round.webp"), "WEBP", quality=95)
                
                # Foreground adaptive icon
                fg_icon = create_foreground(src, fg_size)
                fg_icon.save(os.path.join(target_dir, "ic_launcher_foreground.webp"), "WEBP", quality=95)
                print(f"  Android {density} icons generated.")

        # Update background xml to match black/dark theme
        bg_xml_path = os.path.join(android_res, "drawable/ic_launcher_background.xml")
        if os.path.exists(bg_xml_path):
            with open(bg_xml_path, "w", encoding="utf-8") as f:
                f.write("""<?xml version="1.0" encoding="utf-8"?>
<vector
    android:height="108dp"
    android:width="108dp"
    android:viewportHeight="108"
    android:viewportWidth="108"
    xmlns:android="http://schemas.android.com/apk/res/android">
    <path android:fillColor="#040404"
          android:pathData="M0,0h108v108h-108z"/>
</vector>
""")
        val_bg_path = os.path.join(android_res, "values/ic_launcher_background.xml")
        if os.path.exists(val_bg_path):
            with open(val_bg_path, "w", encoding="utf-8") as f:
                f.write("""<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#040404</color>
</resources>
""")

    # 4. IOS (Capacitor)
    ios_icon_path = os.path.join(ROOT_DIR, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png")
    if os.path.exists(os.path.dirname(ios_icon_path)):
        print("--> Generating iOS AppIcon...")
        src.resize((1024, 1024), Image.Resampling.LANCZOS).convert('RGB').save(ios_icon_path, "PNG")
        print("  iOS AppIcon-512@2x.png (1024x1024) generated.")

    print("All icons successfully generated!")

if __name__ == "__main__":
    main()
