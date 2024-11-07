import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import Ajv from "ajv";
import schema from "../shared/types.schema.json";

const ajv = new Ajv();
const isValidBodyParams = ajv.compile(
    schema.definitions["Album"] || {}
);

const ddbDocClient = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
    try {
        console.log("[EVENT]", JSON.stringify(event));
        const body = event.body ? JSON.parse(event.body) : undefined;
        const parameters = event?.pathParameters;
        const albumId = parameters?.albumId ? parseInt(parameters.albumId) : undefined;
        const artist = event.queryStringParameters?.artist || undefined;

        if (!albumId) {
            return {
                statusCode: 404,
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({ Message: "Missing album Id" }),
            };
        }
        if (!artist) {
            return {
                statusCode: 404,
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({ Message: "Missing artist name" }),
            };
        }

        if(!body) {
            return {
                statusCode: 500,
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({message: "Missing request body"}),
            };
        }

        if(!isValidBodyParams(body)) {
            return {
                statusCode: 500,
                headers: {
                    "content-type": "application-json",
                },
                body: JSON.stringify({
                    message: `Incorrect type. Must match album schema.`,
                    schema: schema.definitions["Album"],
                }),
            };
        }

        const commandOutput = await ddbDocClient.send(
            new UpdateCommand({
                TableName: process.env.TABLE_NAME,
                Key: {
                    id: albumId,
                    artist: artist
                },
                UpdateExpression: "SET title = :t, genres = :g, release_date = :rd, review = :r",
                ExpressionAttributeValues: {
                    ":t": body.title,
                    ":g": body.genres,
                    ":rd": body.release_date,
                    ":r": body.review,
                }
            })
        );
        
        return {
            statusCode: 200,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                message: "Album updated",
                updatedAttributes: commandOutput.Attributes,
            }),
        };
    } catch (error: any) {
        console.log(JSON.stringify(error));
        return {
            statusCode: 500,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({error}),
        };
    }
};

function createDDbDocClient() {
    const ddbClient = new DynamoDBClient({region: process.env.REGION});
    const marshallOptions = {
        convertEmptyValues: true,
        removeUndefinedValues: true,
        convertClassInstanceToMap: true,
    };
    const unmarshallOptions = {
        wrapNumbers: false,
    };
    const translateConfig = {marshallOptions, unmarshallOptions};
    return DynamoDBDocumentClient.from(ddbClient, translateConfig);
}