#!/bin/bash
set -e

echo "Waiting for MongoDB primary to accept connections..."
until mongosh --host mongo:27017 --eval "db.adminCommand('ping')" > /dev/null 2>&1; do
  sleep 1
done

echo "Initiating replica set rs0 for single-node transaction support..."
mongosh --host mongo:27017 --eval '
try {
  const status = rs.status();
  print("Replica set rs0 is already initiated and active.");
} catch (e) {
  print("Initiating new replica set rs0...");
  rs.initiate({
    _id: "rs0",
    members: [{ _id: 0, host: "mongo:27017" }]
  });
  print("Replica set rs0 initiated successfully.");
}
'

echo "Mongo replica set setup complete."
