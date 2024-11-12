#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Ca1Stack } from '../lib/ca1-stack';

const app = new cdk.App();

new Ca1Stack(app, 'Ca1Stack', {

});