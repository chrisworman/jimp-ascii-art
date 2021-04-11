import React, { useEffect, useRef, useState } from 'react';
import './App.css';
import Jimp from 'jimp';

interface GreyScaleFunction {
  name: string;
  grey: (r:number, g:number, b: number) => number;
};

const DEFAULT_PIXEL_SIZE = 5;
const GREY_SCALE_FUNCTIONS: GreyScaleFunction[] = [
  {
    name: 'Average',
    grey: (r:number, g:number, b: number) => (r+b+g) / 3.0,
  },
  {
    name: '0.3/0.59/0.11',
    grey: (r:number, g:number, b: number) => r * 0.3 + g * 0.59 + b * 0.11,
  },
  {
    name: 'ITU-R BT.709',
    grey: (r:number, g:number, b: number) => r * 0.2126 + g * 0.7152 + b * 0.0722,
  },
  {
    name: 'ITU-R BT.601',
    grey: (r:number, g:number, b: number) => r * 0.299 + g * 0.587 + b * 0.114,
  },
  {
    name: 'Desaturate (HSL)',
    grey: (r:number, g:number, b: number) => ( Math.max(r, g, b) + Math.min(r, g, b) ) / 2.0,
  },
];

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [asciiTable, setAsciiTable] = useState<string[]|undefined>(); // 0..100
  const [file, setFile] = useState<File|undefined>();
  const [asciiArt, setAsciiArt] = useState<string|undefined>();
  const [pixelSize, setPixelSize] = useState(DEFAULT_PIXEL_SIZE);
  const [fontSize, setFontSize] = useState(6);
  const [greyScaleFunctionName, setGreyScaleFunctionName] = useState('ITU-R BT.601');
  const [contrast, setContrast] = useState(0.25);
  const [brightness, setBrightness] = useState(0.1);
  const [colorMode, setColorMode] = useState<'white'|'black'>('black');
  const [menuOpen, setMenuOpen] = useState(true);

  useEffect(() => {
    if (!asciiTable && canvasRef.current) {
      
      const alphabet: string[] = [];
      for(let c=32;c<127;++c) { // Standard ascii
        alphabet.push(String.fromCharCode(c));
      }
      // for(let c=8000;c<8700;++c) { // ????
      //   alphabet.push(String.fromCharCode(c));
      // }
      for(let c=9500;c<9700;++c) { // Drawing characters
        alphabet.push(String.fromCharCode(c));
      }

      const letterIntensities: { 
        letter: string;
        intensity: number;
      }[] = [];
      for (let a=0; a<alphabet.length; a++) {
        const letter = alphabet[a];
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.font = '15px monospace';
          ctx.fillStyle = "black";
          ctx.fillText(letter, 0, 15);
          ctx.strokeText(letter, 0, 15);
          const letterPixels = ctx.getImageData(0, 0, 15, 18);
          let pixelCount = 0;
          let total = 0;
          for (let p=0; p<letterPixels.data.length; p+=4) {
            total += ( (letterPixels.data[p] / 255.0) + (letterPixels.data[p+1] / 255.0) + (letterPixels.data[p+2] / 255.0)) / 3.0;
            pixelCount++;
          }
          letterIntensities.push({
            letter,
            intensity: total / pixelCount,
          });
        }
      }

      const newAsciiTable: string[] = [];
      letterIntensities.sort((l1, l2) => l1.intensity - l2.intensity); // black -> white (when printed with black font on white bg)
      letterIntensities.forEach((li, index) => newAsciiTable[index] = li.letter);

      setAsciiTable(newAsciiTable);
      
    }
  }, [asciiTable]);

  useEffect(() => {
    (async () => {
      if (file && asciiTable) {

        // Compute the pixel grid
        const image = await Jimp.read(Buffer.from(await file.arrayBuffer()));
        image.contrast(contrast);
        image.brightness(brightness);
        const pixelGrid: number[][] = [];
        let pixelGridX = 0;
        let pixelGridY = 0;
        const grey = GREY_SCALE_FUNCTIONS.find(f => f.name === greyScaleFunctionName)?.grey;
        if (!grey) {
          return;
        }

        for (let x=0; x<image.getWidth()-pixelSize-1; x+=pixelSize) {
          pixelGrid[pixelGridX] = [];
          for (let y=0; y<image.getHeight()-pixelSize-1; y+=pixelSize) {

            let pixelSum = 0;
            for (let boxX=x; boxX<x+pixelSize; boxX++) {
              for (let boxY=y; boxY<y+pixelSize; boxY++) {
                const pixelColor = image.getPixelColor(boxX, boxY);
                const rgba = Jimp.intToRGBA(pixelColor);
                pixelSum += grey(rgba.r / 255.0, rgba.g / 255.0, rgba.b / 255.0);
              }
            }
            pixelGrid[pixelGridX][pixelGridY] = pixelSum / (pixelSize * pixelSize);
            pixelGridY++;

          }
          pixelGridX++;
          pixelGridY = 0;
        }

        const rotatedPixelGrid = pixelGrid[0].map((_, colIndex) => pixelGrid.map(row => row[colIndex]));

        // Compute the ascii art
        const asciiArtBuffer = [];
        for (let x=0; x<rotatedPixelGrid.length; x++) {
          const row = rotatedPixelGrid[x];
          for (let y=0; y<row.length; y++) {
            // const asciiArtIndex = Math.floor((colorMode === 'white' ? row[y] : 1.0 - row[y]) * 100);
            const asciiArtIndex = Math.floor((colorMode === 'white' ? row[y] : 1.0 - row[y]) * (asciiTable.length-1));
            asciiArtBuffer.push(asciiTable[asciiArtIndex]);
          }
          asciiArtBuffer.push('\n');
        }

        setAsciiArt(asciiArtBuffer.join());
      }
    })();
  }, [file, asciiTable, pixelSize, greyScaleFunctionName, contrast, brightness, colorMode]);

  const onFile = (event: React.ChangeEvent<HTMLInputElement> | undefined) => {
    if (event?.target?.files) {
      setFile(event.target.files[0]);
    }
  };

  return (
    <>
      <div>
          {
            asciiTable
            ?
              <>
                <div
                  onClick={() => setMenuOpen(wasOpen => !wasOpen)}
                  style={{
                    backgroundColor: '#F44336',
                    width: '50px',
                    height: '50px',
                    lineHeight: '47px',
                    borderRadius: '100%',
                    background: '#F44336',
                    border: 'none',
                    outline: 'none',
                    color: '#FFF',
                    fontSize: '30px',
                    boxShadow: '0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23)',
                    transition: '0.3s',
                    textAlign: 'center',
                    cursor: 'pointer',
                    userSelect: 'none',
                    position: 'fixed',
                    top: 10,
                    left: 10,
                  }}
                >
                  {menuOpen ? '«' : '☰'}
                </div>
                <div
                  className={menuOpen ? 'fadeIn' : 'fadeOut'}
                  style={{
                    //display: menuOpen ? 'inline-block' : 'none',
                    padding: '10px',
                    borderRadius: '8px',
                    backgroundColor: 'white',
                    boxShadow: '0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23)',
                    position: 'fixed',
                    top: 10,
                    left: 65,
                  }}
                >
                  <div style={{ fontSize: '11px' }}>
                    <div style={{ marginBottom: '10px'}}>
                      <input
                        type="file"
                        accept="image/*"
                        style={{ fontSize: '10px' }}
                        onChange={(event) => {
                          onFile(event);
                          setMenuOpen(false);
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: '10px'}}>
                      <label>Pixel Size</label>
                      <input
                        style={{ fontSize: '11px' }}
                        value={pixelSize}
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        onChange={(event) => {
                          const intValue = parseInt(event.target.value);
                          if (!isNaN(intValue)) {
                            setPixelSize(intValue);
                          }
                        }} 
                      />
                    </div>
                    <div style={{ marginBottom: '10px'}}>
                      <label>Font Size</label>
                      <input
                        style={{ fontSize: '11px' }}
                        value={fontSize}
                        type="number"
                        min="6"
                        max="20"
                        step="1"
                        onChange={(event) => {
                          const intValue = parseInt(event.target.value);
                          if (!isNaN(intValue)) {
                            setFontSize(intValue);
                          }
                        }} 
                      />
                    </div>
                    <div style={{ marginBottom: '10px'}}>
                      <label>Contrast</label>
                      <input
                        style={{ fontSize: '11px' }}
                        value={contrast}
                        type="number"
                        min="-1"
                        max="1"
                        step="0.1"
                        onChange={(event) => {
                          const floatValue = parseFloat(event.target.value);
                          if (!isNaN(floatValue)) {
                            setContrast(floatValue);
                          }
                        }} 
                      />
                    </div>
                    <div style={{ marginBottom: '10px'}}>
                      <label>Brightness</label>
                      <input
                        style={{ fontSize: '11px' }}
                        value={brightness}
                        type="number"
                        min="-1"
                        max="1"
                        step="0.1"
                        onChange={(event) => {
                          const floatValue = parseFloat(event.target.value);
                          if (!isNaN(floatValue)) {
                            setBrightness(floatValue);
                          }
                        }} 
                      />
                    </div>
                    <div style={{ marginBottom: '10px'}}>
                      <label>Color Mode</label>
                      <select
                        style={{ fontSize: '11px' }}
                        value={colorMode}
                        onChange={(event) => {
                          setColorMode(event.target.value as 'black' | 'white');
                        }} 
                      >
                        <option value='black'>White Font / Black BG</option>
                        <option value='white'>Black Font / White BG</option>
                      </select>
                    </div>
                    <div style={{ marginBottom: '10px'}}>
                      <label>Grey Scale</label>
                      <select
                        style={{ fontSize: '11px' }}
                        value={greyScaleFunctionName}
                        onChange={(event) => {
                          setGreyScaleFunctionName(event.target.value);
                        }} 
                      >
                        {
                          GREY_SCALE_FUNCTIONS.map(g => {
                            return (
                              <option key={g.name} value={g.name}>
                                {g.name}
                              </option>
                            );
                          })
                        }
                      </select>
                    </div>
                  </div>
                </div>
              </>
            :
              <p>Loading ascii table</p>
          }
      </div>
      <canvas ref={canvasRef} style={{ display: 'none', margin: 0, padding: 0}} width="15" height="18"></canvas>
      {
        asciiArt &&
        <pre 
          style={{ 
            fontSize: `${fontSize}px`,
            backgroundColor: colorMode,
            color: colorMode === 'white' ? 'black' : 'white',
            display: 'inline-block',
            margin: 0,
          }}
          >
            {asciiArt}
          </pre>
      }   
    </>
  );
}

export default App;
