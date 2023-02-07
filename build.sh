yarn build:prod

cd indexer
GOBIN=$(pwd)/../functions go install .
