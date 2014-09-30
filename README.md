SVG font dumper
===============

This tool is used to dump SVG font into separate images.

~ sometimes you may be feeling a bit blue, then you realize 
all you needed was a good dump.

Installation:

```
npm install svg-font-dump
```


Usage:

```
fs=require('fs')
ttf2svg=require('ttf2svg'); //please run "npm install -gf ttf2svg" to make this one available
FontDump=require('full/or/relative/path/to/svg-font-dump.js') 
//FontDump=require('svg-font-dump') //once on npm

ttf='C:/Windows/Fonts/webdings.ttf'
svg='C:/webdings.svg'
dir='C:/new/fonts/webdings/glyphs/'

fs.readFile(ttf,next)

function next(er,buffer){if(er){throw er}
svgContent=ttf2svg(buffer);fs.writeFileSync(svg,svgContent)
FontDump.DumpSVG({i:svg,o:dir,x:1})
}
```

the line above ~ "tool.DumpSVG(args)" 
and other CLI variations may also be run 
via the Command Line with:
```
node full/or/relative/path/to/svg-font-dump.js -i C:/webdings.svg -o C:/new/fonts/webdings/glyphs/ -x 1
```

where 
-i is "the path to your input font.svg" and,
-o is "the folder in which to save the results" 
(the output directory will be created by 
svg-font-dump if it does not exist)

-i and -o are the only 2 mandatory arguments, 
check the source for the other Command Line Options 


Authors
-------

- [Kir Belevich](https://github.com/deepsweet)
- [Vitaly Puzrin](https://github.com/puzrin)


License
-------
View the [LICENSE](https://github.com/fontello/svg-font-dump/blob/master/LICENSE) file
(MIT).
