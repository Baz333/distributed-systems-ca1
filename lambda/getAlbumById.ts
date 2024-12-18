import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommandInput, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { TranslateClient, TranslateTextCommand } from "@aws-sdk/client-translate";

const ddbDocClient = createDDbDocClient();
const translateClient = new TranslateClient({ region: process.env.REGION });

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
    try {
        console.log("[EVENT]", JSON.stringify(event));
        const parameters = event?.pathParameters;
        const albumId = parameters?.albumId ? parseInt(parameters.albumId) : undefined;
        const artist = event.queryStringParameters?.artist || undefined;
        const translate = event.queryStringParameters?.translate || undefined;

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

        const commandOutput = await ddbDocClient.send(
            new QueryCommand({
                TableName: process.env.TABLE_NAME,
                KeyConditionExpression: "id = :id AND artist = :a",
                ExpressionAttributeValues: {
                    ":id": albumId,
                    ":a": artist,
                },
            })
        );

        console.log("GetCommand response: ", commandOutput);
        if (!commandOutput.Items) {
            return {
                statusCode: 404,
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({ Message: "Album not found" }),
            };
        }
        const body: any = {
            data: commandOutput.Items,
        };

        if(translate) {
            const translation = await translateClient.send(
                new TranslateTextCommand({
                    Text: commandOutput.Items[0].review,
                    SourceLanguageCode: "en",
                    TargetLanguageCode: translate,
                })
            );
            commandOutput.Items[0].review = translation.TranslatedText;
        }

        return {
            statusCode: 200,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify(body),
        };
    } catch (error: any) {
        console.log(JSON.stringify(error));
        return {
            statusCode: 500,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({ error }),
        };
    }
};

function createDDbDocClient() {
    const ddbClient = new DynamoDBClient({ region: process.env.REGION });
    const marshallOptions = {
        convertEmptyValues: true,
        removeUndefinedValues: true,
        convertClassInstanceToMap: true,
    };
    const unmarshallOptions = {
        wrapNumbers: false,
    };
    const translateConfig = { marshallOptions, unmarshallOptions };
    return DynamoDBDocumentClient.from(ddbClient, translateConfig);
}
