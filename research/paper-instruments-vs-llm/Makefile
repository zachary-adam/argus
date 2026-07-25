# Build PDFs and an arXiv source zip
.PHONY: all pdf zip clean

all: pdf

pdf: main.pdf supplement.pdf

main.pdf: main.tex refs.bib
	pdflatex -interaction=nonstopmode main.tex
	bibtex main
	pdflatex -interaction=nonstopmode main.tex
	pdflatex -interaction=nonstopmode main.tex

supplement.pdf: supplement.tex
	pdflatex -interaction=nonstopmode supplement.tex
	pdflatex -interaction=nonstopmode supplement.tex

zip: pdf
	rm -f arxiv-source.zip
	zip -r arxiv-source.zip \
	  main.tex main.pdf refs.bib \
	  supplement.tex supplement.pdf \
	  README.md Makefile \
	  data supplement \
	  -x "*.DS_Store" "*__MACOSX*" "*.env*"
	@echo "Wrote arxiv-source.zip"

clean:
	rm -f *.aux *.bbl *.blg *.log *.out *.toc *.synctex.gz
